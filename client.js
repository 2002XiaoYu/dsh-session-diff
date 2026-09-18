
		/* ==================== src/00-head.js ==================== */
/**
 * dsh-session-diff — browser half.
 *
 * Lazy-CJS bundle for the DSH client module loader. Evaluating this file only
 * registers a factory; the body below runs when the shell materializes the
 * plugin. Only platform seed words may be required — every other dependency in
 * this bundle is hand-written.
 *
 * The loader id is the PACKAGE NAME (every shipped bundle does the same, e.g.
 * @deepseek-ai/dsh-client-ui-sidebar-files): the shell's module table keys
 * factories by the id carried in window.__DSH_BOOT__, so a mismatch would make
 * the plugin unresolvable. scripts/build.mjs substitutes it from package.json
 * so a rename can never drift.
 */
window.__ModuleLoader__.load({
	id: "dsh-session-diff",
	factory: (require) => {
		var module = { exports: {} };
		const React = require("react");
		const h = React.createElement;
		const useState = React.useState;
		const useEffect = React.useEffect;
		const useMemo = React.useMemo;
		const useRef = React.useRef;
		const useSyncExternalStore = React.useSyncExternalStore;

		/* ==================== src/10-util.js ==================== */
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

		/* ==================== src/20-tokenizer.js ==================== */
/* ------------------------------------------------------------------ *
 * Syntax colouring.
 *
 * The shipped code viewer reaches shiki only through the primitives'
 * CodeBlock, which exposes no per-line decoration and no tokenizer, so this
 * bundle carries its own scanner. Token types map onto the theme's own
 * --shiki-token-* custom properties, which keeps the palette identical to the
 * rest of the GUI.
 * ------------------------------------------------------------------ */

/**
 * The shell's highlighter is configured with `variablePrefix: "--shiki-"` and
 * its theme plugin defines these ten properties, so referencing them keeps this
 * viewer's palette identical to every other code surface. The literal fallbacks
 * are the theme plugin's own light values, used only if it is absent.
 */
const TOKEN_COLOR = {
	comment: "var(--shiki-token-comment, #868e96)",
	string: "var(--shiki-token-string, #2f9e44)",
	stringExpr: "var(--shiki-token-string-expression, #2b8a3e)",
	keyword: "var(--shiki-token-keyword, #d6336c)",
	constant: "var(--shiki-token-constant, #1c7ed6)",
	func: "var(--shiki-token-function, #6741d9)",
	param: "var(--shiki-token-parameter, #e8590c)",
	punct: "var(--shiki-token-punctuation, #495057)",
	link: "var(--shiki-token-link, #1971c2)"
};

const EXT_LANG = {
	dart: "dart",
	js: "js",
	mjs: "js",
	cjs: "js",
	jsx: "js",
	ts: "js",
	tsx: "js",
	mts: "js",
	cts: "js",
	vue: "markup",
	svelte: "markup",
	json: "json",
	jsonc: "json",
	yaml: "yaml",
	yml: "yaml",
	toml: "yaml",
	ini: "yaml",
	properties: "yaml",
	lock: "yaml",
	py: "py",
	pyi: "py",
	rb: "py",
	sh: "sh",
	bash: "sh",
	zsh: "sh",
	fish: "sh",
	env: "sh",
	css: "css",
	scss: "css",
	less: "css",
	html: "markup",
	htm: "markup",
	xml: "markup",
	svg: "markup",
	md: "md",
	markdown: "md",
	mdx: "md",
	sql: "sql",
	java: "java",
	kt: "java",
	kts: "java",
	gradle: "java",
	swift: "java",
	scala: "java",
	go: "go",
	rs: "rust",
	php: "php",
	c: "c",
	h: "c",
	cc: "c",
	cpp: "c",
	cxx: "c",
	hpp: "c",
	m: "c",
	mm: "c",
	cs: "java"
};

function languageOf(path) {
	const name = basenameOf(path).toLowerCase();
	if (name === "dockerfile" || name === "makefile" || name === ".env" || name.indexOf(".env.") === 0) return "sh";
	if (name === "cmakelists.txt") return "sh";
	const dot = name.lastIndexOf(".");
	if (dot <= 0 || dot === name.length - 1) return "plain";
	return EXT_LANG[name.slice(dot + 1)] || "plain";
}

const KEYWORDS = {
	dart: "abstract as assert async await break case catch class const continue covariant default deferred do dynamic else enum export extends extension external factory final finally for get hide if implements import in interface is late library mixin new on operator part required rethrow return set show static super switch sync this throw true false null try typedef var void while with yield",
	js: "as async await break case catch class const continue debugger default delete do else enum export extends finally for from function get if implements import in instanceof interface let new of package private protected public return set static super switch this throw try typeof var void while with yield satisfies keyof readonly declare type namespace abstract true false null undefined",
	py: "and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case True False None self",
	sh: "case do done elif else esac fi for function if in local return select then until while export source alias echo cd set unset readonly declare true false",
	java: "abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while var val fun object when suspend override open data sealed companion in is as true false null",
	go: "break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var true false nil",
	rust: "as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self static struct super trait true type unsafe use where while",
	php: "abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile eval exit extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list namespace new or print private protected public require require_once return static switch throw trait try unset use var while xor yield true false null",
	sql: "select from where insert into values update set delete create table alter drop join left right inner outer on group by order having limit offset union all as and or not null is in like between distinct count sum avg min max case when then else end primary key foreign references index true false",
	css: "important media supports keyframes import charset font-face from to and not only true false inherit initial unset revert transparent currentColor",
	markup: "true false null",
	yaml: "true false null yes no on off",
	json: "true false null",
	md: "",
	plain: ""
};

const WORD_RE = /[A-Za-z_$][A-Za-z0-9_$]*/y;
const PUNCT_RE = /[{}()[\];,.:?!<>=+\-*\/%&|^~@#]+/y;
const NUMBER_RE = /0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?\d+)?/y;

function setOf(words) {
	const out = new Set();
	for (const word of String(words).split(/\s+/)) if (word) out.add(word);
	return out;
}

const KEYWORD_SETS = {};
for (const key of Object.keys(KEYWORDS)) KEYWORD_SETS[key] = setOf(KEYWORDS[key]);

function followedByParen(text, index) {
	let i = index;
	while (i < text.length && (text[i] === " " || text[i] === "\t")) i += 1;
	return text[i] === "(";
}

function buildRules(lang) {
	const rules = [];
	const lineComments = { dart: ["///", "//"], js: ["//"], py: ["#"], sh: ["#"], java: ["//"], go: ["//"], rust: ["//"], php: ["//", "#"], sql: ["--"], css: [], markup: [], yaml: ["#"], json: [], md: [], c: ["//"], plain: [] }[lang] || [];
	for (const prefix of lineComments) {
		rules.push({ type: "comment", re: new RegExp(prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[^\\n]*", "y") });
	}
	const blockComment = ["dart", "js", "java", "go", "rust", "php", "sql", "css", "c"].indexOf(lang) !== -1;
	if (blockComment) rules.push({ type: "comment", re: /\/\*[\s\S]*?(?:\*\/|$)/y });

	if (lang === "markup") {
		rules.push({ type: "comment", re: /<!--[\s\S]*?(?:-->|$)/y });
		rules.push({ type: "keyword", re: /<\/?[A-Za-z][A-Za-z0-9:._-]*|\/?>/y });
		rules.push({ type: "string", re: /"[^"]*"|'[^']*'/y });
		rules.push({ type: "func", re: /[A-Za-z_:][A-Za-z0-9:._-]*(?=\s*=)/y });
		rules.push({ type: "punct", re: /=/y });
		return rules;
	}

	if (lang === "md") {
		rules.push({ type: "keyword", re: /^#{1,6}[^\n]*/my });
		rules.push({ type: "comment", re: /^\s*```[^\n]*/my });
		rules.push({ type: "string", re: /`[^`\n]*`/y });
		rules.push({ type: "link", re: /\[[^\]\n]*\]\([^)\n]*\)/y });
		rules.push({ type: "keyword", re: /^\s*[-*+]\s|^\s*\d+\.\s/my });
		rules.push({ type: "constant", re: /\*\*[^*\n]+\*\*|__[^_\n]+__/y });
		rules.push({ type: "string", re: /\*[^*\n]+\*|_[^_\n]+_/y });
		return rules;
	}

	if (lang === "yaml") {
		rules.push({ type: "func", re: /[A-Za-z_][A-Za-z0-9_.-]*(?=\s*:)/y });
		rules.push({ type: "string", re: /"[^"\n]*"|'[^'\n]*'/y });
		rules.push({ type: "constant", re: /[&*][A-Za-z0-9_-]+/y });
		rules.push({ type: "keyword", re: /^[ \t]*-[ \t]/my });
		rules.push({ type: "keyword", re: /[|>][-+]?\d*/y });
		rules.push({ type: "constant", re: NUMBER_RE });
		rules.push({ type: "punct", re: /[:,\-{}[\]]/y });
		return rules;
	}

	if (lang === "css") {
		rules.push({ type: "keyword", re: /@[A-Za-z-]+/y });
		rules.push({ type: "string", re: /"[^"\n]*"|'[^'\n]*'/y });
		rules.push({ type: "constant", re: /#[0-9a-fA-F]{3,8}\b/y });
		rules.push({ type: "func", re: /[A-Za-z-]+(?=\s*\()/y });
		rules.push({ type: "param", re: /[A-Za-z-]+(?=\s*:)/y });
		rules.push({ type: "constant", re: /-?\d*\.?\d+(?:px|em|rem|%|vh|vw|vmin|vmax|s|ms|deg|fr|ch|ex|pt|cm|mm|in)?/y });
		rules.push({ type: "punct", re: PUNCT_RE });
		rules.push({ type: "word", re: WORD_RE });
		return rules;
	}

	if (lang === "sh") {
		rules.push({ type: "string", re: /'[^']*'/y });
		rules.push({ type: "string", re: /"(?:\\.|[^"\\])*"/y });
		rules.push({ type: "param", re: /\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*|\$[0-9@*#?$!-]/y });
		rules.push({ type: "constant", re: NUMBER_RE });
		rules.push({ type: "punct", re: PUNCT_RE });
		rules.push({ type: "word", re: WORD_RE });
		return rules;
	}

	if (lang === "c") rules.push({ type: "keyword", re: /^[ \t]*#[ \t]*[A-Za-z]+/my });

	if (lang === "py" || lang === "php") rules.push({ type: "func", re: /@[A-Za-z_][A-Za-z0-9_.]*/y });

	// Strings. Triple-quoted forms come first so the scanner never splits them.
	const triple = lang === "py" || lang === "dart";
	if (triple) rules.push({ type: "string", re: /[rRbB]?('''[\s\S]*?(?:'''|$)|"""[\s\S]*?(?:"""|$))/y });
	rules.push({ type: "string", re: /(?:[rRbB]|@)?("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')/y });
	if (lang === "js") rules.push({ type: "string", re: /`(?:\\[\s\S]|[^`\\])*`/y });
	if (lang === "dart") rules.push({ type: "stringExpr", re: /\$[A-Za-z_][A-Za-z0-9_.]*|\$\{[^}]*\}/y });

	rules.push({ type: "constant", re: NUMBER_RE });
	rules.push({ type: "punct", re: PUNCT_RE });
	rules.push({ type: "word", re: WORD_RE });
	return rules;
}

const RULES_BY_LANG = {};

function rulesFor(lang) {
	if (!RULES_BY_LANG[lang]) RULES_BY_LANG[lang] = buildRules(lang);
	return RULES_BY_LANG[lang];
}

/**
 * Tokenize a whole document in one pass. Scanning the whole text (rather than
 * line by line) is what lets multi-line comments, triple-quoted strings, and
 * fenced markdown blocks colour correctly.
 * @returns absolute-offset tokens, in document order.
 */
function tokenize(text, lang) {
	const family = lang || "plain";
	const keywords = KEYWORD_SETS[family] || KEYWORD_SETS.plain;
	if (family === "plain" || !text) return [];
	const rules = rulesFor(family);
	const tokens = [];
	const length = text.length;
	let index = 0;
	while (index < length) {
		let matched = false;
		for (const rule of rules) {
			rule.re.lastIndex = index;
			const match = rule.re.exec(text);
			if (!match || match[0].length === 0) continue;
			const value = match[0];
			let type = rule.type;
			if (type === "word") {
				if (keywords.has(value)) type = "keyword";
				else if (followedByParen(text, index + value.length)) type = "func";
				else type = null;
			}
			if (type) tokens.push({ start: index, end: index + value.length, type: type });
			index += value.length;
			matched = true;
			break;
		}
		if (!matched) index += 1;
	}
	return tokens;
}

function lineRanges(text) {
	const ranges = [];
	let start = 0;
	for (let i = 0; i < text.length; i += 1) {
		if (text[i] === "\n") {
			ranges.push({ start: start, end: i });
			start = i + 1;
		}
	}
	// A trailing newline terminates the last line instead of opening an empty one,
	// which is what splitLines() counts too: the two line models must agree
	// because rows are indexed by line numbers from both.
	if (start < text.length || text.length === 0) ranges.push({ start: start, end: text.length });
	return ranges;
}

/** Split the document into per-line colour segments. */
function lineSegments(text, lang) {
	const ranges = lineRanges(text);
	const tokens = tokenize(text, lang);
	const result = [];
	let cursor = 0;
	for (const range of ranges) {
		const parts = [];
		let position = range.start;
		while (cursor < tokens.length && tokens[cursor].end <= range.start) cursor += 1;
		let index = cursor;
		while (index < tokens.length && tokens[index].start < range.end) {
			const token = tokens[index];
			if (token.start > position) parts.push({ text: text.slice(position, token.start), type: null });
			const from = Math.max(token.start, range.start);
			const to = Math.min(token.end, range.end);
			if (to > from) parts.push({ text: text.slice(from, to), type: token.type });
			position = Math.max(position, to);
			index += 1;
		}
		if (position < range.end) parts.push({ text: text.slice(position, range.end), type: null });
		result.push(parts);
	}
	return result;
}

		/* ==================== src/30-diff.js ==================== */
/* ------------------------------------------------------------------ *
 * Diff engine.
 *
 * The conversation hands out `FileDiff = {path, oldText, newText}` hunk slices
 * (three context lines each, no line numbers). To decorate a whole file the way
 * git does, the current text is first walked BACKWARDS through the conversation's
 * hunks to reconstruct the text as it looked before this conversation, and the
 * two revisions are then line-diffed. Everything downstream (row kinds, gutter
 * numbers) comes from that diff, so the decoration is exact whenever the
 * reconstruction succeeds and degrades to hunk-anchored output when it cannot.
 * ------------------------------------------------------------------ */

const MYERS_MAX_D = 600;
const MYERS_MAX_CELLS = 4000000;

/** Copy of the shipped viewer's metadata narrowing (host module is not importable here). */
function narrowHunks(meta) {
	if (typeof meta !== "object" || meta === null || Array.isArray(meta)) return null;
	const diffs = meta.diffs;
	if (!Array.isArray(diffs) || diffs.length === 0) return null;
	const out = [];
	for (const hunk of diffs) {
		if (typeof hunk !== "object" || hunk === null) return null;
		const path = hunk.path;
		const oldText = hunk.oldText;
		const newText = hunk.newText;
		if (typeof path !== "string") return null;
		if (oldText !== null && typeof oldText !== "string") return null;
		if (typeof newText !== "string") return null;
		out.push({ path: path, oldText: oldText, newText: newText });
	}
	return out;
}

/** Depth-first walk of conversation nodes, collecting applied file hunks in order. */
function collectHunks(nodes, into, depth) {
	if (!Array.isArray(nodes) || (depth || 0) > 6) return;
	for (const node of nodes) {
		if (!node || typeof node !== "object") continue;
		if (node.subCalls) collectHunks(node.subCalls, into, (depth || 0) + 1);
		if (node.kind !== "tool-result") continue;
		if (node.isError) continue;
		const hunks = narrowHunks(node.meta);
		if (!hunks) continue;
		for (const hunk of hunks) {
			into.push({ path: hunk.path, oldText: hunk.oldText, newText: hunk.newText, seq: typeof node.seq === "number" ? node.seq : into.length });
		}
	}
}

function splitLines(text) {
	const lines = String(text).split("\n");
	if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
	return lines;
}

/** Locate `needle` nearest to `hint`, so repeated snippets resolve in place. */
function locate(text, needle, hint) {
	if (!needle) return -1;
	let best = -1;
	let bestDistance = Infinity;
	let from = 0;
	for (;;) {
		const found = text.indexOf(needle, from);
		if (found === -1) break;
		const distance = Math.abs(found - hint);
		if (distance < bestDistance) {
			bestDistance = distance;
			best = found;
		}
		from = found + 1;
	}
	return best;
}

/**
 * Walk the hunks newest-first, replacing each hunk's `newText` with its
 * `oldText`, which yields the pre-conversation text.
 */
function reverseApply(currentText, hunks) {
	let text = currentText;
	let hint = currentText.length;
	const unresolved = [];
	let applied = 0;
	for (let i = hunks.length - 1; i >= 0; i -= 1) {
		const hunk = hunks[i];
		const position = locate(text, hunk.newText, hint);
		if (position === -1) {
			unresolved.push(hunk);
			continue;
		}
		text = text.slice(0, position) + (hunk.oldText === null ? "" : hunk.oldText) + text.slice(position + hunk.newText.length);
		hint = position;
		applied += 1;
	}
	return { baseline: text, unresolved: unresolved, applied: applied };
}

/**
 * Bounded Myers diff over line arrays. `null` means the edit script exceeded the
 * budget, which the caller renders as a whole-region replacement.
 */
function myersOps(a, b) {
	const n = a.length;
	const m = b.length;
	if (n === 0 && m === 0) return [];
	if (n * m > MYERS_MAX_CELLS && Math.max(n, m) > 4000) return null;
	const max = n + m;
	const offset = max;
	const v = new Int32Array(2 * max + 2);
	const trace = [];
	const limit = Math.min(max, MYERS_MAX_D);
	let found = -1;
	for (let d = 0; d <= limit; d += 1) {
		trace.push(v.slice(Math.max(0, offset - d), offset + d + 1));
		for (let k = -d; k <= d; k += 2) {
			let x;
			if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) x = v[offset + k + 1];
			else x = v[offset + k - 1] + 1;
			let y = x - k;
			while (x < n && y < m && a[x] === b[y]) {
				x += 1;
				y += 1;
			}
			v[offset + k] = x;
			if (x >= n && y >= m) {
				found = d;
				break;
			}
		}
		if (found >= 0) break;
	}
	if (found < 0) return null;

	const ops = [];
	let x = n;
	let y = m;
	for (let d = found; d > 0; d -= 1) {
		const previous = trace[d];
		const k = x - y;
		let previousK;
		if (k === -d || (k !== d && previous[k + d - 1] < previous[k + d + 1])) previousK = k + 1;
		else previousK = k - 1;
		const previousX = previous[previousK + d];
		const previousY = previousX - previousK;
		while (x > previousX && y > previousY) {
			ops.push({ kind: "ctx", oldIndex: x - 1, newIndex: y - 1 });
			x -= 1;
			y -= 1;
		}
		if (x === previousX) {
			ops.push({ kind: "add", newIndex: y - 1 });
			y -= 1;
		} else {
			ops.push({ kind: "del", oldIndex: x - 1 });
			x -= 1;
		}
	}
	while (x > 0 && y > 0) {
		ops.push({ kind: "ctx", oldIndex: x - 1, newIndex: y - 1 });
		x -= 1;
		y -= 1;
	}
	return ops.reverse();
}

function rowsFromOps(ops, older, newer) {
	const rows = [];
	for (const op of ops) {
		if (op.kind === "ctx") rows.push({ kind: "ctx", oldNo: op.oldIndex + 1, newNo: op.newIndex + 1, oldIndex: op.oldIndex, newIndex: op.newIndex });
		else if (op.kind === "del") rows.push({ kind: "del", oldNo: op.oldIndex + 1, newNo: null, oldIndex: op.oldIndex, newIndex: null });
		else rows.push({ kind: "add", oldNo: null, newNo: op.newIndex + 1, oldIndex: null, newIndex: op.newIndex });
	}
	return rows;
}

function wholeReplacementRows(older, newer) {
	const rows = [];
	for (let i = 0; i < older.length; i += 1) rows.push({ kind: "del", oldNo: i + 1, newNo: null, oldIndex: i, newIndex: null });
	for (let i = 0; i < newer.length; i += 1) rows.push({ kind: "add", oldNo: null, newNo: i + 1, oldIndex: null, newIndex: i });
	return rows;
}

/**
 * Build the decorated model for one file.
 * @param currentText - the file as it is on disk now.
 * @param hunks - this conversation's hunks for that file, oldest first.
 * @param lang - colouring grammar.
 */
function buildFileModel(currentText, hunks, lang) {
	// Blank-only text counts as zero lines: a file created by this conversation
	// must read as pure additions, a file emptied by it as pure deletions, and
	// neither should report a stray empty line as changed.
	const currentLines = currentText.trim() === "" ? [] : splitLines(currentText);
	const reconstruction = reverseApply(currentText, hunks || []);
	const baselineLines = reconstruction.baseline.trim() === "" ? [] : splitLines(reconstruction.baseline);
	const ops = (hunks || []).length === 0 ? [] : myersOps(baselineLines, currentLines);
	const rows = (hunks || []).length === 0 ? currentLines.map((line, index) => ({ kind: "ctx", oldNo: index + 1, newNo: index + 1, oldIndex: index, newIndex: index })) : ops ? rowsFromOps(ops, baselineLines, currentLines) : wholeReplacementRows(baselineLines, currentLines);

	let added = 0;
	let removed = 0;
	for (const row of rows) {
		if (row.kind === "add") added += 1;
		else if (row.kind === "del") removed += 1;
	}

	const currentSegments = lineSegments(currentText, lang);
	const baselineSegments = reconstruction.unresolved.length > 0 ? lineSegments(reconstruction.baseline, lang) : null;

	return {
		rows: rows,
		added: added,
		removed: removed,
		changed: added + removed,
		currentLines: currentLines,
		baselineLines: baselineLines,
		currentSegments: currentSegments,
		baselineSegments: baselineSegments,
		degraded: reconstruction.unresolved.length > 0,
		unresolved: reconstruction.unresolved.length
	};
}

/**
 * Collapse long unchanged runs so "changes only" mode stays scannable.
 * @param openKeys - gap keys the reader already expanded; those stay open.
 */
function collapseRows(rows, context, threshold, openKeys) {
	const keep = [];
	for (let i = 0; i < rows.length; i += 1) {
		if (rows[i].kind !== "ctx") {
			for (let j = Math.max(0, i - context); j <= Math.min(rows.length - 1, i + context); j += 1) keep[j] = true;
		}
	}
	const out = [];
	let index = 0;
	while (index < rows.length) {
		if (keep[index]) {
			out.push(rows[index]);
			index += 1;
			continue;
		}
		let end = index;
		while (end < rows.length && !keep[end]) end += 1;
		const hidden = end - index;
		const opened = openKeys && typeof openKeys.has === "function" && openKeys.has(index);
		if (hidden > threshold && !opened) out.push({ kind: "gap", hidden: hidden, from: rows[index].oldNo || rows[index].newNo, firstIndex: index });
		else for (let i = index; i < end; i += 1) out.push(rows[i]);
		index = end;
	}
	return out;
}

		/* ==================== src/40-reader.js ==================== */
/* ------------------------------------------------------------------ *
 * File reading.
 *
 * The shipped viewer owns page-by-page reads through the same Remote
 * namespace; this plugin needs whole-file text to diff, so it walks the pages
 * itself and stops at a generous cap instead of streaming forever.
 * ------------------------------------------------------------------ */

const PAGE_LINES = 600;
const MAX_LINES = 20000;
const MAX_PAGES = 80;

let filesRemote = null;

function filesRemoteOf(ctx) {
	const remote = ctx && ctx.remote;
	const files = remote && remote.workspaceFiles;
	return files && typeof files.read === "function" ? files : null;
}

/** Latch the workspace-files namespace at apply time; bodies run long after. */
function captureRemote(ctx) {
	const files = filesRemoteOf(ctx);
	if (files) filesRemote = files;
	return files;
}

/** Tolerate the Remote carrier's result envelope across shapes. */
function unwrapRemote(result) {
	if (result === null || result === undefined) return { ok: false, error: "empty result" };
	if (typeof result !== "object") return { ok: true, value: result };
	if (result.ok === true) return { ok: true, value: result.value };
	if (result.ok === false) return { ok: false, error: result.error || result.failure || "request failed" };
	if (result.success === true) return { ok: true, value: result.data !== undefined ? result.data : result.value };
	if (result.success === false) return { ok: false, error: result.error || "request failed" };
	if (result.error) return { ok: false, error: result.error };
	return { ok: true, value: result };
}

function failureText(error) {
	if (!error) return "unknown error";
	if (typeof error === "string") return error;
	if (typeof error.message === "string") return error.message;
	if (typeof error.code === "string") return error.code;
	try {
		return JSON.stringify(error);
	} catch (nested) {
		return String(error);
	}
}

/**
 * Read a whole file through the workspace-files Remote.
 * @returns {Promise<{text, lines, eof, version, absolutePath, truncated}>}
 */
async function readWholeFile(files, sessionId, path, signal) {
	const parts = [];
	let offset = 1;
	let eof = false;
	let lines = 0;
	let version;
	let absolutePath;
	let pages = 0;
	while (!eof && lines < MAX_LINES && pages < MAX_PAGES) {
		const response = unwrapRemote(await files.read(sessionId, path, { offset: offset, limit: PAGE_LINES }, signal));
		if (!response.ok) throw new Error(failureText(response.error));
		const value = response.value || {};
		const text = typeof value.text === "string" ? value.text : "";
		if (parts.length > 0) {
			const previous = parts[parts.length - 1];
			if (previous.length > 0 && !previous.endsWith("\n") && text.length > 0) parts.push("\n");
		}
		parts.push(text);
		if (typeof value.version === "string") version = value.version;
		if (typeof value.absolutePath === "string") absolutePath = value.absolutePath;
		const pageLines = typeof value.lines === "number" ? value.lines : splitLines(text).length;
		lines += pageLines;
		pages += 1;
		if (value.eof === true || pageLines === 0) eof = true;
		else offset += pageLines;
	}
	return {
		text: parts.join(""),
		lines: lines,
		eof: eof,
		version: version,
		absolutePath: absolutePath,
		truncated: !eof
	};
}

		/* ==================== src/50-store.js ==================== */
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

		/* ==================== src/60-ui-file.js ==================== */
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

		/* ==================== src/70-ui-changes.js ==================== */
/* ------------------------------------------------------------------ *
 * Companion page: every file this conversation changed.
 * ------------------------------------------------------------------ */

function SessionChangesBody(props) {
	useStyleOnce();
	const t = translateOf(props);
	const version = useStoreVersion();
	const tabState = readTabState(props);
	const addressSession = parseChangesAddress(tabState.address);
	// A guide-opened page tab carries no session in its address (`sidebar://<kind>`),
	// so the body's own sessionId prop is the primary source.
	const sessionId = tabState.sessionId || (addressSession && addressSession.sessionId) || SessionDiffStore.activeSessionId();
	const chatNodes = typeof props.useChat === "function" ? props.useChat(selectLegacyNodes) : null;
	const files = useMemo(
		() => (sessionId ? (chatNodes ? filesFromNodes(chatNodes) : SessionDiffStore.files(sessionId)) : []),
		[sessionId, chatNodes, version]
	);

	function openFile(file) {
		if (!sessionId || !tabState.actions || typeof tabState.actions.openResource !== "function") return;
		const cwd = SessionDiffStore.cwd(sessionId);
		const address = sessionFileAddress(sessionId, toAddressPath(file.path, cwd));
		try {
			tabState.actions.openResource(address, {});
		} catch (error) {
			/* opening is best-effort; the list stays usable */
		}
	}

	let totalAdded = 0;
	let totalRemoved = 0;
	for (const file of files) {
		totalAdded += file.added;
		totalRemoved += file.removed;
	}

	const header = h(
		"div",
		{ className: "dsd-head" },
		h("span", { className: "dsd-path" }, L(t, "changesTitle", "Session changes")),
		files.length > 0
			? h(
					"span",
					{ className: "dsd-stat" },
					String(files.length),
					" ",
					h("span", { className: "dsd-stat-add" }, "+" + totalAdded),
					" ",
					h("span", { className: "dsd-stat-del" }, "−" + totalRemoved)
			  )
			: null,
		h("span", { className: "dsd-spacer" })
	);

	let body = null;
	if (!sessionId) body = h("div", { className: "dsd-empty" }, L(t, "noSession", "No session context available."));
	else if (files.length === 0) body = h("div", { className: "dsd-empty" }, L(t, "changesEmpty", "This conversation has not modified any file yet."), h("br"), L(t, "changesHint", ""));
	else {
		const items = files.map(function (file, index) {
			const directory = dirnameOf(file.path);
			return h(
				"div",
				{
					key: file.key + ":" + index,
					className: "dsd-item",
					title: file.path,
					onClick: function () {
						openFile(file);
					}
				},
				h(
					"div",
					{ className: "dsd-item-top" },
					h("span", { className: "dsd-item-name" }, basenameOf(file.path)),
					h("span", { className: "dsd-spacer" }),
					h("span", { className: "dsd-stat-add dsd-stat" }, "+" + file.added),
					h("span", { className: "dsd-stat-del dsd-stat" }, "−" + file.removed)
				),
				directory ? h("div", { className: "dsd-item-dir" }, directory) : null
			);
		});
		body = h("div", { className: "dsd-body" }, h("div", { className: "dsd-list" }, items));
	}

	return h("div", { className: "dsd-root" }, header, body);
}

function SessionChangesTitle(props) {
	return h("span", null, L(props && props.t, "changesTitle", languageIsZh() ? COPY.zh.changesTitle : COPY.en.changesTitle));
}

		/* ==================== src/80-apply.js ==================== */
/* ------------------------------------------------------------------ *
 * Registration.
 * ------------------------------------------------------------------ */

/**
 * Browser services this bundle needs before `apply` runs.
 *
 * `uiConversation` and `sessions` are declared because the client context refuses
 * undeclared service reads outright, and `canOpen` — which runs during tab
 * routing, outside any body — needs the conversation's hunks synchronously.
 */
const inject = ["slots", "locale", "sidebarRightTabs", "remote", "remote.workspaceFiles", "uiConversation", "sessions"];

function fileTabDefinition() {
	return {
		id: FILE_TAB_ID,
		kind: FILE_TAB_KIND,
		patterns: ["dsh-resource://file/**"],
		priority: "extension",
		/** Claim only files this conversation actually changed; everything else keeps the shipped viewer. */
		canOpen: function (address) {
			try {
				const parsed = parseSessionFileAddress(address);
				if (!parsed) return false;
				return SessionDiffStore.hasChanges(parsed.sessionId, parsed.path);
			} catch (error) {
				return false;
			}
		},
		title: function (address) {
			const parsed = parseSessionFileAddress(address);
			return parsed ? basenameOf(parsed.path) : "Diff";
		}
	};
}

function changesTabDefinition() {
	return {
		id: CHANGES_TAB_ID,
		kind: CHANGES_TAB_KIND,
		patterns: ["dsh-session-diff://changes/**", "dsh-session-diff://changes"],
		priority: "extension",
		title: function () {
			return languageIsZh() ? COPY.zh.changesTitle : COPY.en.changesTitle;
		},
		guide: [
			{
				order: 4,
				title: function () {
					return languageIsZh() ? COPY.zh.changes : COPY.en.changes;
				},
				description: function () {
					return languageIsZh() ? "本次对话修改过的文件与增删行数" : "Files this conversation changed, with add/remove counts";
				}
			}
		]
	};
}

function apply(ctx) {
	captureRemote(ctx);
	bindCopy(ctx);
	tryBind(ctx);
	ctx.effect(() => ctx.locale.register(NS, { zh: COPY.zh, en: COPY.en }), "dsh-session-diff: dictionaries");
	ctx.effect(() => ctx.sidebarRightTabs.register(fileTabDefinition()), "dsh-session-diff: file tab type");
	ctx.effect(() => ctx.sidebarRightTabs.register(changesTabDefinition()), "dsh-session-diff: changes tab type");
	ctx.effect(
		() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({ name: "sidebar.right.pane.tab", key: FILE_TAB_ID, locale: NS }, SessionDiffFileBody)),
		"dsh-session-diff: file body"
	);
	ctx.effect(
		() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({ name: "sidebar.right.pane.tab", key: CHANGES_TAB_ID, locale: NS }, SessionChangesBody)),
		"dsh-session-diff: changes body"
	);
	ctx.effect(
		() => ctx.slots.inject("sidebar.right.pane.tab.title", () => ctx.slots.register({ name: "sidebar.right.pane.tab.title", key: FILE_TAB_ID }, SessionDiffFileTitle)),
		"dsh-session-diff: file title"
	);
	ctx.effect(
		() => ctx.slots.inject("sidebar.right.pane.tab.title", () => ctx.slots.register({ name: "sidebar.right.pane.tab.title", key: CHANGES_TAB_ID }, SessionChangesTitle)),
		"dsh-session-diff: changes title"
	);
	if (typeof console !== "undefined" && console.info) console.info("[dsh-session-diff] client half applied");
}

		/* ==================== src/99-tail.js ==================== */
		// Only module.exports is relied on: the loader takes the factory's return
		// value, so nothing here needs a bare `exports` binding to exist.
		module.exports.apply = apply;
		module.exports.inject = inject;
		return module.exports;
	}
});
