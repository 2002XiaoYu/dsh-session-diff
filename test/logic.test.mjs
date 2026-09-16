/**
 * Logic harness for dsh-session-diff.
 *
 * Loads the dependency-free source modules (util + tokenizer + diff) under Node
 * with stubs, and drives them with hunks produced by the SAME algorithm the host
 * uses: dsh-tool-fs calls jsdiff's `structuredPatch(..., {context: 3})` and keeps
 * the context lines in both sides, with `oldText: null` only when a hunk has no
 * old lines at all. Reproducing that here is what makes these assertions
 * meaningful rather than self-fulfilling.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// `diff` is a devDependency (jsdiff, the same library dsh-tool-fs uses for its
// hunks). A checkout without node_modules points DSH_INSTALL at a local DSH
// install to reuse the copy that ships with it.
const DSH = process.env.DSH_INSTALL || "/Users/yuhuicheng/.nvm/versions/node/v24.19.0/lib/node_modules/@deepseek-ai/dsh";
let structuredPatch;
try {
	({ structuredPatch } = require("diff"));
} catch (error) {
	try {
		({ structuredPatch } = require(DSH + "/node_modules/diff"));
	} catch (nested) {
		throw new Error("this test needs jsdiff: run `npm install` (or set DSH_INSTALL to a DSH install)");
	}
}

const here = new URL(".", import.meta.url);
const files = ["10-util.js", "20-tokenizer.js", "30-diff.js"];
const source = files.map((name) => readFileSync(new URL("../src/" + name, here), "utf8")).join("\n");

const exported = [
	"parseSessionFileAddress",
	"sessionFileAddress",
	"parseChangesAddress",
	"pathMatches",
	"basenameOf",
	"dirnameOf",
	"toAddressPath",
	"languageOf",
	"tokenize",
	"lineSegments",
	"buildFileModel",
	"collapseRows",
	"splitLines",
	"myersOps"
];

const api = new Function("React", "h", source + "\nreturn {" + exported.join(",") + "};")({ createElement() {} }, () => {});

let passed = 0;
let failed = 0;

function check(label, condition, detail) {
	if (condition) {
		passed += 1;
		console.log("  ok   " + label);
	} else {
		failed += 1;
		console.log("  FAIL " + label + (detail === undefined ? "" : "  -> " + JSON.stringify(detail)));
	}
}

/** Verbatim port of the host's computeHunkDiffs (dsh-tool-fs/lib/index.js). */
function computeHunkDiffs(path, before, after) {
	const patch = structuredPatch("", "", before, after, undefined, undefined, { context: 3 });
	const diffs = [];
	for (const hunk of patch.hunks) {
		const oldLines = [];
		const newLines = [];
		for (const line of hunk.lines) {
			if (line.startsWith("\\")) continue;
			const text = line.slice(1);
			if (line.startsWith("-")) oldLines.push(text);
			else if (line.startsWith("+")) newLines.push(text);
			else {
				oldLines.push(text);
				newLines.push(text);
			}
		}
		diffs.push({ path, oldText: oldLines.length > 0 ? oldLines.join("\n") : null, newText: newLines.join("\n") });
	}
	return diffs;
}

const FILE = "/Users/me/proj/lib/features/swap/swap_page.dart";

console.log("\naddresses");
{
	const address = api.sessionFileAddress("session-1", "lib/features/swap/foo bar.dart");
	check("round trip", api.parseSessionFileAddress(address).path === "lib/features/swap/foo bar.dart", address);
	check("session id", api.parseSessionFileAddress(address).sessionId === "session-1");
	check("absolute scope rejected", api.parseSessionFileAddress("dsh-resource://file/absolute/tmp/x.dart") === null);
	check("changes address", api.parseChangesAddress("dsh-session-diff://changes/session-1").sessionId === "session-1");
	check("changes address bare", api.parseChangesAddress("dsh-session-diff://changes") !== null);
}

console.log("\npaths");
{
	check("absolute vs relative", api.pathMatches("/Users/me/proj/lib/a.dart", "lib/a.dart") === true);
	check("different", api.pathMatches("/a/b/c.dart", "lib/d.dart") === false);
	check("cwd relative", api.toAddressPath("/Users/me/proj/lib/a.dart", "/Users/me/proj") === "lib/a.dart");
	check("outside cwd kept", api.toAddressPath("/other/a.dart", "/Users/me/proj") === "/other/a.dart");
	check("language", api.languageOf("lib/main.dart") === "dart" && api.languageOf("pubspec.yaml") === "yaml" && api.languageOf("NOTICE") === "plain");
}

console.log("\ntokenizer");
{
	const code = '// hi\nclass A {\n  final int x = 1;\n  String greet(String name) => "hi $name";\n}\n';
	const tokens = api.tokenize(code, "dart");
	const kinds = new Set(tokens.map((token) => token.type));
	check("token kinds", kinds.has("comment") && kinds.has("keyword") && kinds.has("string") && kinds.has("constant"), [...kinds]);
	check("comment covers line", tokens[0].type === "comment" && code.slice(tokens[0].start, tokens[0].end) === "// hi");
	const lines = api.splitLines(code);
	const segments = api.lineSegments(code, "dart");
	check("one segment list per line", segments.length === lines.length, [segments.length, lines.length]);
	for (let i = 0; i < lines.length; i += 1) {
		const rebuilt = segments[i].map((part) => part.text).join("");
		if (rebuilt !== lines[i]) {
			check("segments rebuild line " + i, false, [rebuilt, lines[i]]);
			break;
		}
		if (i === lines.length - 1) check("segments rebuild every line", true);
	}
	check("multi-line comment is one token", api.tokenize("a /* one\ntwo */ b", "js").filter((token) => token.type === "comment").length === 1);
	check("empty text is one empty line", api.lineSegments("", "dart").length === 1);
}

const BASE = ["import 'a';", "", "class SwapPage {", "  int count = 0;", "", "  void init() {", "    count = 1;", "  }", "", "  void dispose() {", "    count = 0;", "  }", "}", ""].join("\n");

console.log("\nreplacement");
{
	const after = BASE.replace("count = 1;", "count = 42;");
	const hunks = computeHunkDiffs(FILE, BASE, after);
	check("single hunk", hunks.length === 1, hunks.length);
	check("oldText carries context", hunks[0].oldText.split("\n").length === 7, hunks[0].oldText.split("\n").length);
	const model = api.buildFileModel(after, hunks, "dart");
	check("baseline reconstructed", model.baselineLines.join("\n") === BASE.replace(/\n$/, ""), model.baselineLines.slice(0, 3));
	check("counts 1/1", model.added === 1 && model.removed === 1, [model.added, model.removed]);
	check("not degraded", model.degraded === false && model.unresolved === 0);
	const changed = model.rows.filter((row) => row.kind !== "ctx");
	check("changed rows carry the right text", changed.length === 2 && changed[0].kind === "del" && model.baselineLines[changed[0].oldIndex] === "    count = 1;" && model.currentLines[changed[1].newIndex] === "    count = 42;", changed);
	check("gutter numbers agree with git", model.rows.find((row) => row.kind === "add").newNo === 7, model.rows.find((row) => row.kind === "add"));
}

console.log("\ninsertion");
{
	const after = BASE.replace("    count = 1;\n", "    count = 1;\n    print(count);\n");
	const hunks = computeHunkDiffs(FILE, BASE, after);
	const model = api.buildFileModel(after, hunks, "dart");
	check("baseline reconstructed", model.baselineLines.join("\n") === BASE.replace(/\n$/, ""));
	check("counts 1/0", model.added === 1 && model.removed === 0, [model.added, model.removed]);
}

console.log("\ndeletion");
{
	const after = BASE.replace("    count = 1;\n", "");
	const hunks = computeHunkDiffs(FILE, BASE, after);
	const model = api.buildFileModel(after, hunks, "dart");
	check("baseline reconstructed", model.baselineLines.join("\n") === BASE.replace(/\n$/, ""));
	check("counts 0/1", model.added === 0 && model.removed === 1, [model.added, model.removed]);
}

console.log("\ntwo hunks far apart");
{
	// jsdiff merges hunks whose three-line contexts touch, so the two changes sit
	// far enough apart here (line 3 and line 18) to stay separate.
	const wide = [];
	for (let i = 1; i <= 20; i += 1) wide.push(i === 3 ? "target = 1;" : i === 18 ? "target = 0;" : "  line " + i + ";");
	const before = wide.join("\n") + "\n";
	const afterText = before.replace("target = 1;", "target = 42;").replace("target = 0;", "target = -1;");
	const hunks = computeHunkDiffs(FILE, before, afterText);
	check("two hunks", hunks.length === 2, hunks.length);
	const model = api.buildFileModel(afterText, hunks, "dart");
	check("baseline reconstructed", model.baselineLines.join("\n") === before.replace(/\n$/, ""), model.baselineLines.length);
	check("counts 2/2", model.added === 2 && model.removed === 2, [model.added, model.removed]);
	check("changed row positions", model.rows.filter((row) => row.kind === "del").map((row) => row.oldNo).join(",") === "3,18", model.rows.filter((row) => row.kind === "del").map((row) => row.oldNo));
}

console.log("\nrepeated identical blocks (hint-based location)");
{
	const doubled = BASE + "\n" + BASE.replace(/SwapPage/g, "SwapPage2");
	const after = doubled.replace("    count = 0;\n  }\n}\n" + "", "    count = -7;\n  }\n}\n");
	const hunks = computeHunkDiffs(FILE, doubled, after);
	const model = api.buildFileModel(after, hunks, "dart");
	check("baseline reconstructed", model.baselineLines.join("\n") === doubled.replace(/\n$/, ""), model.baselineLines.slice(-6));
}

console.log("\nnew file (oldText null)");
{
	const after = "void main() {\n  runApp(App());\n}\n";
	const hunks = computeHunkDiffs(FILE, "", after);
	check("oldText is null", hunks.length === 1 && hunks[0].oldText === null, hunks);
	const model = api.buildFileModel(after, hunks, "dart");
	check("pure additions", model.added === 3 && model.removed === 0, [model.added, model.removed]);
	check("baseline empty", model.baselineLines.length === 0, model.baselineLines);
}

console.log("\nunlocatable hunk degrades");
{
	// The hunk's newText is nowhere in the file on disk, which is what happens when
	// something other than this conversation rewrote the file afterwards.
	const hunks = computeHunkDiffs(FILE, "p\nq\nr\n", "p\nQ\nr\n");
	const model = api.buildFileModel("totally\ndifferent\n", hunks, "dart");
	check("degraded", model.degraded === true && model.unresolved === 1, [model.degraded, model.unresolved]);
}

console.log("\ncollapseRows");
{
	const rows = [];
	for (let i = 0; i < 40; i += 1) rows.push({ kind: i === 20 ? "add" : "ctx", oldNo: i + 1, newNo: i + 1, oldIndex: i, newIndex: i });
	const collapsed = api.collapseRows(rows, 3, 6, new Set());
	check("collapses to two gaps", collapsed.filter((row) => row.kind === "gap").length === 2, collapsed.filter((row) => row.kind === "gap").length);
	check("keeps the change", collapsed.some((row) => row.kind === "add"));
	const gapKey = collapsed.find((row) => row.kind === "gap").firstIndex;
	check("opened gap expands", api.collapseRows(rows, 3, 6, new Set([gapKey])).filter((row) => row.kind === "gap").length === 1);
}

console.log("\n" + passed + " passed, " + failed + " failed\n");
process.exit(failed === 0 ? 0 : 1);
