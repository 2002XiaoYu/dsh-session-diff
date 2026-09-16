/* ------------------------------------------------------------------ *
 * File body: the decorated whole-file view.
 * ------------------------------------------------------------------ */

function useStoreVersion() {
	return useSyncExternalStore(SessionDiffStore.subscribe, SessionDiffStore.getVersion, SessionDiffStore.getVersion);
}

/**
 * Tab bodies receive runtime props; address and actions come from the tab record.
 * For an address-opened tab `contentId` IS the address, and every session-scoped
 * body also receives `sessionId` directly — tab info itself carries neither.
 */
function readTabState(props) {
	let info = null;
	try {
		if (props && typeof props.useTabInfo === "function") info = props.useTabInfo();
	} catch (error) {
		info = null;
	}
	if (!info) info = props && props.tabInfo ? props.tabInfo : null;
	const tab = info && info.tab ? info.tab : null;
	const navigation = tab && tab.navigation ? tab.navigation : null;
	const address =
		(tab && typeof tab.contentId === "string" ? tab.contentId : null) ||
		(navigation && typeof navigation.address === "string" ? navigation.address : null) ||
		(props && props.resourceAddress) ||
		null;
	return {
		info: info,
		tab: tab,
		address: address,
		actions: tab && tab.actions ? tab.actions : null,
		sessionId: (props && props.sessionId) || (info && info.sessionId) || null,
		params: navigation ? navigation.params : undefined
	};
}

function tokenNodes(segments) {
	if (!segments) return null;
	const nodes = [];
	for (let i = 0; i < segments.length; i += 1) {
		const part = segments[i];
		if (!part.type) nodes.push(part.text);
		else nodes.push(h("span", { key: "t" + i, style: { color: TOKEN_COLOR[part.type] || undefined } }, part.text));
	}
	return nodes;
}

function SessionDiffFileBody(props) {
	useStyleOnce();
	const t = translateOf(props);
	const version = useStoreVersion();
	const tabState = readTabState(props);
	const address = tabState.address;
	const parsed = useMemo(() => parseSessionFileAddress(address), [address]);
	const sessionId = (parsed ? parsed.sessionId : null) || tabState.sessionId;
	const path = parsed ? parsed.path : null;
	// The standard `useChat` prop is the live source; the service-bound store is the
	// fallback for assemblies that do not hand it to this seat.
	const chatNodes = typeof props.useChat === "function" ? props.useChat(selectLegacyNodes) : null;
	const hunks = useMemo(
		() => (sessionId && path ? (chatNodes ? hunksFromNodes(chatNodes, path) : SessionDiffStore.hunksFor(sessionId, path)) : []),
		[sessionId, path, chatNodes, version]
	);
	const files = useMemo(() => (chatNodes ? filesFromNodes(chatNodes) : sessionId ? SessionDiffStore.files(sessionId) : []), [chatNodes, sessionId, version]);
	const hunksKey = useMemo(
		() =>
			hunks
				.map((hunk) => (hunk.seq || 0) + ":" + (hunk.newText ? hunk.newText.length : 0) + ":" + (hunk.oldText ? hunk.oldText.length : 0))
				.join("|"),
		[hunks]
	);

	const [read, setRead] = useState({ status: "loading" });
	const [nonce, setNonce] = useState(0);
	const [preferredMode, setPreferredMode] = useState(null);
	const [openGaps, setOpenGaps] = useState(() => new Set());
	const bodyRef = useRef(null);
	const scrolledFor = useRef(null);

	useEffect(() => {
		if (!sessionId || !path) {
			setRead({ status: "error", message: L(t, "noSession", "No session context available.") });
			return undefined;
		}
		if (!filesRemote) {
			setRead({ status: "error", message: L(t, "readFailed", "Failed to read the file") + ": workspaceFiles remote is not available." });
			return undefined;
		}
		let cancelled = false;
		const controller = typeof AbortController === "function" ? new AbortController() : null;
		const timer = setTimeout(function () {
			setRead(function (previous) {
				return previous && previous.status === "ready" ? Object.assign({}, previous, { stale: true }) : { status: "loading" };
			});
			readWholeFile(filesRemote, sessionId, path, controller ? controller.signal : undefined)
				.then(function (result) {
					if (!cancelled) setRead(Object.assign({ status: "ready" }, result, { stale: false }));
				})
				.catch(function (error) {
					if (!cancelled) setRead({ status: "error", message: failureText(error) });
				});
		}, 250);
		return function () {
			cancelled = true;
			clearTimeout(timer);
			if (controller) controller.abort();
		};
	}, [sessionId, path, nonce, hunksKey]);

	const model = useMemo(() => {
		if (read.status !== "ready" || !path) return null;
		return buildFileModel(read.text, hunks, languageOf(path));
	}, [read.status, read.text, hunks, path]);

	const mode = preferredMode || (model && model.changed > 0 ? "changes" : "whole");

	const displayRows = useMemo(() => {
		if (!model) return [];
		const rows = mode === "changes" ? collapseRows(model.rows, 3, 6, openGaps) : model.rows;
		return rows.length > 8000 ? rows.slice(0, 8000) : rows;
	}, [model, mode, openGaps]);

	const modelKey = address && read.status === "ready" ? address + "@" + (read.version || "") + "@" + hunksKey : null;

	useEffect(() => {
		if (!modelKey || scrolledFor.current === modelKey) return;
		scrolledFor.current = modelKey;
		const container = bodyRef.current;
		if (!container) return;
		const target = container.querySelector('[data-first-change="true"]');
		if (target && typeof target.offsetTop === "number") container.scrollTop = Math.max(0, target.offsetTop - 60);
	}, [modelKey, displayRows]);

	function toggleGap(key) {
		setOpenGaps(function (previous) {
			const next = new Set(previous);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}

	if (!address) {
		return h("div", { className: "dsd-root" }, h("div", { className: "dsd-empty" }, L(t, "noSession", "No session context available.")));
	}

	const header = h(
		"div",
		{ className: "dsd-head" },
		h("span", { className: "dsd-path", title: path || "" }, (dirnameOf(path) ? dirnameOf(path) + "/" : "") + basenameOf(path)),
		model && model.changed > 0
			? h(
					"span",
					{ className: "dsd-stat" },
					h("span", { className: "dsd-stat-add" }, "+" + model.added),
					" ",
					h("span", { className: "dsd-stat-del" }, "−" + model.removed)
			  )
			: null,
		model && model.changed === 0 ? h("span", { className: "dsd-stat" }, L(t, "noChanges", "No changes in this conversation.")) : null,
		h("span", { className: "dsd-spacer" }),
		model && model.changed > 0
			? h(
					"button",
					{
						className: "dsd-btn",
						"data-on": mode === "changes" ? "true" : "false",
						onClick: function () {
							setPreferredMode(mode === "changes" ? "whole" : "changes");
						}
					},
					mode === "changes" ? L(t, "wholeFile", "Whole file") : L(t, "changesOnly", "Changes only")
			  )
			: null,
		files.length > 0 && tabState.actions && typeof tabState.actions.openTab === "function"
			? h(
					"button",
					{
						className: "dsd-btn",
						onClick: function () {
							try {
								tabState.actions.openTab(CHANGES_TAB_KIND);
							} catch (error) {
								/* opening the companion page is best-effort */
							}
						}
					},
					L(t, "changes", "Session changes") + " (" + files.length + ")"
			  )
			: null,
		h(
			"button",
			{
				className: "dsd-btn",
				onClick: function () {
					setNonce(function (value) {
						return value + 1;
					});
				}
			},
			L(t, "refresh", "Re-read")
		)
	);

	let body = null;
	if (read.status === "loading") body = h("div", { className: "dsd-empty" }, L(t, "loading", "Reading file…"));
	else if (read.status === "error") body = h("div", { className: "dsd-error" }, L(t, "readFailed", "Failed to read the file") + ": " + read.message);
	else if (model) {
		const nodes = displayRows.map(function (row, index) {
			if (row.kind === "gap") {
				const open = openGaps.has(row.firstIndex);
				return h(
					"div",
					{ key: "gap" + index, className: "dsd-gap" },
					h("span", null, "⋯ " + row.hidden + " " + L(t, "collapsed", "unchanged lines")),
					h(
						"button",
						{
							className: "dsd-gap-btn",
							onClick: function () {
								toggleGap(row.firstIndex);
							}
						},
						open ? L(t, "collapse", "Collapse") : L(t, "expand", "Expand")
					)
				);
			}
			const isFirstChange = (row.kind === "add" || row.kind === "del") && !displayRows.slice(0, index).some((candidate) => candidate.kind === "add" || candidate.kind === "del");
			const segments = row.kind === "del" ? (model.baselineSegments ? model.baselineSegments[row.oldIndex] : null) : model.currentSegments[row.newIndex];
			const fallback =
				row.kind === "del"
					? model.baselineLines[row.oldIndex] === undefined
						? ""
						: model.baselineLines[row.oldIndex]
					: model.currentLines[row.newIndex] === undefined
					? ""
					: model.currentLines[row.newIndex];
			return h(
				"div",
				{
					key: "row" + index,
					className: "dsd-row" + (row.kind === "add" ? " dsd-add" : row.kind === "del" ? " dsd-del" : ""),
					"data-first-change": isFirstChange ? "true" : undefined
				},
				h("span", { className: "dsd-no" }, row.oldNo === null || row.oldNo === undefined ? "" : String(row.oldNo)),
				h("span", { className: "dsd-no" }, row.newNo === null || row.newNo === undefined ? "" : String(row.newNo)),
				h("span", { className: "dsd-mark" }, row.kind === "add" ? "+" : row.kind === "del" ? "-" : ""),
				h("span", { className: "dsd-code" }, segments ? tokenNodes(segments) : fallback)
			);
		});
		body = h(
			"div",
			{ className: "dsd-body", ref: bodyRef },
			read.truncated ? h("div", { className: "dsd-note" }, L(t, "truncated", "Large file: showing the first 20000 lines.")) : null,
			model.degraded ? h("div", { className: "dsd-note" }, L(t, "partial", "Some changes could not be located in the current file.") + " (" + model.unresolved + ")") : null,
			nodes
		);
	}

	return h("div", { className: "dsd-root" }, header, body);
}

function SessionDiffFileTitle(props) {
	const tabState = readTabState(props);
	const parsed = parseSessionFileAddress(tabState.address);
	return h("span", null, parsed ? basenameOf(parsed.path) : L(props && props.t, "fileTitle", "Conversation diff"));
}
