/* ------------------------------------------------------------------ *
 * Identity, addresses, paths, copy.
 * ------------------------------------------------------------------ */

const NS = "dshSessionDiff";
const FILE_TAB_ID = "dsh-session-diff:file";
const FILE_TAB_KIND = "session-diff-file";
const CHANGES_TAB_ID = "dsh-session-diff:changes";
const CHANGES_TAB_KIND = "session-diff-changes";
const CHANGES_SCHEME = "dsh-session-diff://changes/";
const STYLE_ID = "dsh-session-diff-style";

const COPY = {
	zh: {
		fileTitle: "本次对话改动",
		changes: "本会话改动",
		changesTitle: "本会话改动",
		changesEmpty: "本次对话还没有修改任何文件。",
		changesHint: "用 write / edit 改动的文件会出现在这里，点击即可查看染色差异。",
		loading: "正在读取文件…",
		noChanges: "这个文件在本次对话中没有改动。",
		added: "新增",
		removed: "删除",
		addedShort: "增",
		removedShort: "删",
		wholeFile: "整个文件",
		changesOnly: "只看改动",
		refresh: "重新读取",
		readFailed: "读取文件失败",
		truncated: "文件较大，仅显示前 20000 行。",
		partial: "部分改动未能在当前文件中定位（文件已被后续修改），已按可定位的部分渲染。",
		collapsed: "行未改动",
		expand: "展开",
		collapse: "收起",
		unresolved: "以下改动未定位",
		back: "返回改动清单",
		linesChanged: "改动行",
		goToChange: "定位到第一处改动",
		noSession: "找不到会话上下文，无法计算本次对话的改动。"
	},
	en: {
		fileTitle: "Conversation diff",
		changes: "Session changes",
		changesTitle: "Session changes",
		changesEmpty: "This conversation has not modified any file yet.",
		changesHint: "Files changed by write / edit show up here; click one to see the decorated diff.",
		loading: "Reading file…",
		noChanges: "This file was not changed by the current conversation.",
		added: "added",
		removed: "removed",
		addedShort: "add",
		removedShort: "del",
		wholeFile: "Whole file",
		changesOnly: "Changes only",
		refresh: "Re-read",
		readFailed: "Failed to read the file",
		truncated: "Large file: showing the first 20000 lines.",
		partial: "Some changes could not be located in the current file (it was modified afterwards); the locatable ones are shown.",
		collapsed: "unchanged lines",
		expand: "Expand",
		collapse: "Collapse",
		unresolved: "Unlocated changes",
		back: "Back to changes",
		linesChanged: "changed lines",
		goToChange: "Jump to first change",
		noSession: "No session context available, so this conversation's changes cannot be computed."
	}
};

/** Prefer the slot-provided translator, fall back to the built-in copy. */
function L(t, key, fallback) {
	if (typeof t === "function") {
		try {
			const value = t(key);
			if (value && value !== key) return value;
		} catch (error) {
			/* a missing dictionary entry must never break a render */
		}
	}
	return fallback;
}

function languageIsZh() {
	try {
		const lang = (document.documentElement.getAttribute("lang") || navigator.language || "").toLowerCase();
		return lang.indexOf("zh") === 0;
	} catch (error) {
		return false;
	}
}

/**
 * Namespace-bound translate captured in apply.
 *
 * The slot runtime only hands a body a `t` for namespaces its own type map
 * knows, and a third-party namespace cannot join that map at runtime, so bodies
 * prefer the prop and fall back to this binding (stable per namespace, per the
 * locale service's contract).
 */
let boundT = null;

function bindCopy(ctx) {
	try {
		if (ctx && ctx.locale && typeof ctx.locale.bind === "function") boundT = ctx.locale.bind(NS);
	} catch (error) {
		boundT = null;
	}
	return boundT;
}

function translateOf(props) {
	if (props && typeof props.t === "function") return props.t;
	return boundT;
}

/* ------------------------------------------------------------------ *
 * Addresses: dsh-resource://file/session/<sessionId>/<path>
 * ------------------------------------------------------------------ */

const SESSION_FILE_RE = /^dsh-resource:\/\/file\/session\/([^/]+)\/(.*)$/;
const SESSION_FILE_PREFIX = "dsh-resource://file/session/";

function decodeSegment(segment) {
	try {
		return decodeURIComponent(segment);
	} catch (error) {
		return segment;
	}
}

function decodePath(value) {
	return String(value)
		.split("/")
		.map(decodeSegment)
		.join("/");
}

function parseSessionFileAddress(address) {
	if (typeof address !== "string") return null;
	const match = SESSION_FILE_RE.exec(address);
	if (!match) return null;
	return { sessionId: decodeSegment(match[1]), path: decodePath(match[2]) };
}

/**
 * The address form the chat itself builds when a tool row opens a file. Kept
 * byte-compatible with sessionFileAddress() in the shipped viewer so the two
 * open the SAME tab instead of racing into two tabs for one file.
 */
function sessionFileAddress(sessionId, path) {
	const encodedPath = String(path)
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");
	return SESSION_FILE_PREFIX + encodeURIComponent(sessionId) + "/" + encodedPath;
}

function parseChangesAddress(address) {
	if (typeof address !== "string") return null;
	if (address.indexOf("dsh-session-diff://changes") !== 0) return null;
	const rest = address.slice("dsh-session-diff://changes".length).replace(/^\/+/, "");
	return { sessionId: rest ? decodeSegment(rest) : null };
}

/* ------------------------------------------------------------------ *
 * Paths
 * ------------------------------------------------------------------ */

function normPath(value) {
	return String(value == null ? "" : value)
		.replace(/\\/g, "/")
		.replace(/\.\//g, "")
		.replace(/\/{2,}/g, "/");
}

/** Hunk paths may be absolute while an address path may be workspace-relative. */
function pathMatches(hunkPath, addressPath) {
	const a = normPath(hunkPath);
	const b = normPath(addressPath);
	if (!a || !b) return false;
	if (a === b) return true;
	if (a.endsWith("/" + b)) return true;
	if (b.endsWith("/" + a)) return true;
	return false;
}

function basenameOf(value) {
	const path = normPath(value);
	const index = path.lastIndexOf("/");
	return index === -1 ? path : path.slice(index + 1);
}

function dirnameOf(value) {
	const path = normPath(value);
	const index = path.lastIndexOf("/");
	return index <= 0 ? "" : path.slice(0, index);
}

/** Absolute hunk paths become workspace-relative when the session cwd is known. */
function toAddressPath(path, cwd) {
	const value = String(path || "");
	if (!cwd) return value;
	const root = normPath(cwd).replace(/\/$/, "");
	const target = normPath(value);
	if (target === root) return "";
	if (target.startsWith(root + "/")) return target.slice(root.length + 1);
	return value;
}

/* ------------------------------------------------------------------ *
 * Styles
 * ------------------------------------------------------------------ */

/**
 * Styles. Colours come from the theme plugin's own alias tokens — the diff card
 * (primitives' DiffBlock) draws added/removed text with
 * --dsw-alias-state-success-primary / --dsw-alias-state-error-primary on a
 * --dsw-alias-markdown-code-block surface, and there are no diff-specific
 * tokens, so the row tints derive from those two and stay alpha-based to read on
 * either theme.
 */
const CSS = [
	".dsd-root{display:flex;flex-direction:column;height:100%;min-height:0;font:var(--dsw-font-xs-13,12px/18px inherit);color:var(--dsw-alias-label-primary,inherit)}",
	".dsd-head{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.2));flex-wrap:wrap}",
	".dsd-path{font:var(--dsw-font-markdown-code-block,11px/19px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);color:var(--dsw-alias-label-primary,inherit);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}",
	".dsd-stat{font:var(--dsw-font-markdown-code-block,11px/19px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);white-space:nowrap}",
	".dsd-stat-add{color:var(--dsw-alias-state-success-primary,#22c55e)}",
	".dsd-stat-del{color:var(--dsw-alias-state-error-primary,#ec1313)}",
	".dsd-spacer{flex:1 1 auto}",
	".dsd-btn{appearance:none;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.2));background:transparent;color:var(--dsw-alias-label-secondary,inherit);border-radius:6px;padding:2px 8px;font:var(--dsw-font-xs-13,12px/18px inherit);cursor:pointer;line-height:18px}",
	".dsd-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary,inherit)}",
	".dsd-btn[data-on=true]{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary,inherit)}",
	".dsd-btn:disabled{opacity:.5;cursor:default}",
	".dsd-body{flex:1 1 auto;overflow:auto;min-height:0;padding:4px 0 24px;background:var(--dsw-alias-markdown-code-block,transparent)}",
	".dsd-row{display:flex;align-items:flex-start;font:var(--dsw-font-markdown-code-block,11px/19px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);white-space:pre;tab-size:4}",
	".dsd-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.1))}",
	".dsd-no{flex:0 0 auto;width:44px;text-align:right;padding-right:8px;color:var(--dsw-alias-label-tertiary,#81858c);user-select:none;font-variant-numeric:tabular-nums}",
	".dsd-mark{flex:0 0 auto;width:14px;text-align:center;user-select:none}",
	".dsd-code{flex:1 1 auto;padding-right:16px}",
	".dsd-add{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#22c55e) 14%,transparent)}",
	".dsd-add .dsd-mark{color:var(--dsw-alias-state-success-primary,#22c55e)}",
	".dsd-del{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#ec1313) 14%,transparent)}",
	".dsd-del .dsd-mark{color:var(--dsw-alias-state-error-primary,#ec1313)}",
	".dsd-del .dsd-code{opacity:.85}",
	".dsd-gap{display:flex;align-items:center;gap:8px;padding:2px 10px;color:var(--dsw-alias-label-tertiary,#81858c);font:var(--dsw-font-xs-13,12px/18px inherit);background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08))}",
	".dsd-gap-btn{appearance:none;border:0;background:transparent;color:inherit;cursor:pointer;text-decoration:underline;font:inherit;padding:0}",
	".dsd-note{padding:6px 10px;color:var(--dsw-alias-label-tertiary,#81858c);font:var(--dsw-font-xs-13,12px/18px inherit);border-bottom:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.12))}",
	".dsd-error{margin:10px;padding:8px 10px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#ec1313) 14%,transparent);color:var(--dsw-alias-label-primary,inherit);font-size:12px;white-space:pre-wrap}",
	".dsd-list{display:flex;flex-direction:column;padding:6px}",
	".dsd-item{display:flex;flex-direction:column;gap:2px;padding:7px 9px;border-radius:8px;cursor:pointer;border:1px solid transparent}",
	".dsd-item:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.1));border-color:var(--dsw-alias-border-l2,rgba(127,127,127,.2))}",
	".dsd-item-top{display:flex;align-items:center;gap:8px}",
	".dsd-item-name{font:var(--dsw-font-markdown-code-block,11px/19px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);color:var(--dsw-alias-label-primary,inherit);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
	".dsd-item-dir{color:var(--dsw-alias-label-tertiary,#81858c);font:var(--dsw-font-markdown-code-block,11px/19px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
	".dsd-empty{padding:14px 12px;color:var(--dsw-alias-label-tertiary,#81858c);font-size:12px;line-height:1.6}"
].join("\n");

function ensureStyle(doc) {
	if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;
	const style = doc.createElement("style");
	style.id = STYLE_ID;
	style.textContent = CSS;
	doc.head.appendChild(style);
}

function useStyleOnce() {
	useEffect(() => {
		ensureStyle(document);
	}, []);
}
