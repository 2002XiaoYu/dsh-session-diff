/* ------------------------------------------------------------------ *
 * Conversation-derived change store.
 *
 * `write` / `edit` results carry `meta.diffs` and the client projects `meta`
 * onto the settled tool node, so the current conversation's changes are already
 * in browser state — no host half, no git, no log parsing. This module binds the
 * conversation and session services when they appear, aggregates the hunks per
 * file, and exposes a tiny external store React can subscribe to.
 * ------------------------------------------------------------------ */

let conversation = null;
let sessions = null;
let revision = 0;
let pollTimer = null;
const listeners = new Set();
const bindings = new Map();
const memo = new Map();

function bump() {
	revision += 1;
	for (const listener of listeners) {
		try {
			listener();
		} catch (error) {
			/* one broken subscriber must not stop the others */
		}
	}
}

function snapshotValue(source) {
	if (!source) return undefined;
	if (typeof source.get === "function") {
		try {
			return source.get();
		} catch (error) {
			return undefined;
		}
	}
	if (typeof source.getSnapshot === "function") {
		try {
			return source.getSnapshot();
		} catch (error) {
			return undefined;
		}
	}
	if (source && typeof source === "object" && "value" in source) return source.value;
	if (source && typeof source === "object" && "current" in source) return source.current;
	return source;
}

function attachSession(sessionId) {
	if (bindings.has(sessionId)) return bindings.get(sessionId);
	if (!conversation || typeof conversation.binding !== "function") return null;
	let binding = null;
	try {
		binding = conversation.binding(sessionId);
	} catch (error) {
		binding = null;
	}
	if (!binding) return null;
	let target = null;
	try {
		target = typeof binding.target === "function" ? binding.target("chat") : binding.chat || binding;
	} catch (error) {
		target = null;
	}
	const entry = { binding: binding, target: target, unsubscribe: null };
	const subscribable = target && typeof target.subscribe === "function" ? target : typeof binding.subscribe === "function" ? binding : null;
	if (subscribable) {
		try {
			entry.unsubscribe = subscribable.subscribe(function () {
				bump();
			});
		} catch (error) {
			entry.unsubscribe = null;
		}
	}
	bindings.set(sessionId, entry);
	return entry;
}

function nodesFor(sessionId) {
	const entry = attachSession(sessionId);
	if (!entry) return null;
	const snapshot = snapshotValue(entry.target);
	if (!snapshot || typeof snapshot !== "object") return null;
	const legacy = snapshot.legacy;
	if (legacy && Array.isArray(legacy.nodes)) return legacy.nodes;
	if (Array.isArray(snapshot.nodes)) return snapshot.nodes;
	const store = snapshot.nodes;
	if (store) {
		const inner = snapshotValue(store);
		if (Array.isArray(inner)) return inner;
		if (inner && Array.isArray(inner.nodes)) return inner.nodes;
		if (inner && Array.isArray(inner.list)) return inner.list;
		for (const method of ["list", "values", "toArray"]) {
			if (typeof store[method] === "function") {
				try {
					const result = store[method]();
					if (Array.isArray(result)) return result;
				} catch (error) {
					/* try the next accessor */
				}
			}
		}
	}
	return null;
}

function lastSeq(nodes) {
	for (let i = nodes.length - 1; i >= 0; i -= 1) {
		const seq = nodes[i] && nodes[i].seq;
		if (typeof seq === "number") return seq;
	}
	return 0;
}

function hunkStats(hunk) {
	const older = hunk.oldText === null ? [] : splitLines(hunk.oldText);
	const newer = splitLines(hunk.newText);
	const ops = myersOps(older, newer);
	if (!ops) return { added: newer.length, removed: older.length };
	let added = 0;
	let removed = 0;
	for (const op of ops) {
		if (op.kind === "add") added += 1;
		else if (op.kind === "del") removed += 1;
	}
	return { added: added, removed: removed };
}

/** Hunk grouping shared by the memoized per-session view and the live chat-hook view. */
function groupHunks(collected) {
	const files = new Map();
	for (const hunk of collected) {
		const fileKey = normPath(hunk.path);
		let entry = files.get(fileKey);
		if (!entry) {
			entry = { key: fileKey, path: hunk.path, hunks: [], added: 0, removed: 0, lastSeq: 0 };
			files.set(fileKey, entry);
		}
		entry.hunks.push(hunk);
		entry.lastSeq = Math.max(entry.lastSeq, typeof hunk.seq === "number" ? hunk.seq : 0);
		const stats = hunkStats(hunk);
		entry.added += stats.added;
		entry.removed += stats.removed;
	}
	return Array.from(files.values()).sort(function (a, b) {
		return b.lastSeq - a.lastSeq;
	});
}

/** The conversation's hunks for one file, from nodes the caller already holds. */
function hunksFromNodes(nodes, path) {
	if (!nodes || !path) return [];
	const collected = [];
	collectHunks(nodes, collected, 0);
	const merged = [];
	for (const hunk of collected) if (pathMatches(hunk.path, path)) merged.push(hunk);
	return merged;
}

/** Every file this conversation changed, from nodes the caller already holds. */
function filesFromNodes(nodes) {
	const collected = [];
	if (nodes) collectHunks(nodes, collected, 0);
	return groupHunks(collected);
}

/** Selector for the standard `useChat` prop: the legacy node slice carrying tool results. */
function selectLegacyNodes(snapshot) {
	return snapshot && snapshot.legacy ? snapshot.legacy.nodes : null;
}

function computeFiles(sessionId) {
	const nodes = nodesFor(sessionId);
	const key = nodes ? nodes.length + "@" + lastSeq(nodes) : "none@" + revision;
	const cached = memo.get(sessionId);
	if (cached && cached.key === key) return cached;

	const collected = [];
	if (nodes) collectHunks(nodes, collected, 0);
	const list = groupHunks(collected);
	const next = { key: key, list: list, resolved: !!nodes };
	memo.set(sessionId, next);
	return next;
}

/** Files changed in a session, merged across every path alias that resolves to one address. */
function fileEntries(sessionId) {
	return computeFiles(sessionId).list;
}

function sessionCwd(sessionId) {
	if (!sessions) return null;
	const state = snapshotValue(sessions.list);
	if (!state) return null;
	const byId = state.byId;
	if (byId && byId[sessionId]) {
		const row = byId[sessionId];
		return row.cwd || row.workspaceRoot || (row.session && row.session.cwd) || null;
	}
	const entries = state.sessions || state.items || state.list || (Array.isArray(state) ? state : null);
	if (!entries) return null;
	for (const entry of entries) {
		if (!entry) continue;
		const id = entry.id || entry.sessionId || (entry.session && entry.session.id);
		if (id !== sessionId) continue;
		return entry.cwd || entry.workspace || entry.workspaceRoot || (entry.session && entry.session.cwd) || null;
	}
	return null;
}

function activeSessionId() {
	if (!sessions) return null;
	const state = snapshotValue(sessions.list);
	if (!state || typeof state !== "object") return null;
	return state.current || state.activeId || state.activeSessionId || state.currentId || (state.active && state.active.id) || null;
}

/** Poll only while something is mounted and no live subscription exists. */
function ensurePolling() {
	if (pollTimer !== null || listeners.size === 0) return;
	pollTimer = setInterval(function () {
		let subscribed = false;
		for (const entry of bindings.values()) if (entry.unsubscribe) subscribed = true;
		if (!subscribed) bump();
	}, 2000);
}

function stopPolling() {
	if (pollTimer === null) return;
	clearInterval(pollTimer);
	pollTimer = null;
}

/**
 * Read a service without tripping a strict client context.
 *
 * The browser-side cordis context throws on reading a service the plugin did not
 * declare ("cannot get property X without inject"), so an undeclared read is a
 * boot failure, not an undefined value. Every access here is therefore guarded,
 * and the declarations in the module-level `inject` export are what make the
 * services legally readable in the first place.
 */
function readService(ctx, key) {
	try {
		const value = ctx[key];
		return value === undefined ? null : value;
	} catch (error) {
		return null;
	}
}

function bindServices(ctx) {
	if (!conversation) conversation = readService(ctx, "uiConversation") || readService(ctx, "conversation") || null;
	if (!sessions) sessions = readService(ctx, "sessions") || readService(ctx, "sessionController") || null;
	if (conversation) {
		const active = activeSessionId();
		if (active) {
			attachSession(active);
			computeFiles(active);
		}
	}
	return !!(conversation && sessions);
}

function tryBind(ctx) {
	// Primary path: the services are declared, so this read is legal and binding is
	// synchronous — `canOpen` needs the hunks before any body ever renders.
	if (bindServices(ctx)) return;
	// Secondary path: a context that withholds the services from the root scope
	// hands them to the injected callback instead.
	if (typeof ctx.inject !== "function") return;
	try {
		ctx.inject(["uiConversation", "sessions"], function (scoped) {
			bindServices(scoped);
		});
	} catch (error) {
		/* a host without injectable services simply leaves the store unbound */
	}
}

const SessionDiffStore = {
	subscribe(listener) {
		listeners.add(listener);
		ensurePolling();
		return function () {
			listeners.delete(listener);
			if (listeners.size === 0) stopPolling();
		};
	},
	getVersion() {
		return revision;
	},
	ready() {
		return !!conversation;
	},
	files(sessionId) {
		if (!sessionId) return [];
		return fileEntries(sessionId);
	},
	hunksFor(sessionId, path) {
		if (!sessionId || !path) return [];
		const merged = [];
		for (const file of fileEntries(sessionId)) {
			if (!pathMatches(file.path, path)) continue;
			for (const hunk of file.hunks) merged.push(hunk);
		}
		return merged;
	},
	hasChanges(sessionId, path) {
		if (!sessionId || !path) return false;
		for (const file of fileEntries(sessionId)) if (pathMatches(file.path, path)) return true;
		return false;
	},
	cwd(sessionId) {
		return sessionCwd(sessionId);
	},
	activeSessionId: activeSessionId
};
