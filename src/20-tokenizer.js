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
