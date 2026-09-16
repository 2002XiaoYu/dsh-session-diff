/**
 * Smoke test for the built client bundle.
 *
 * Loads lib/client.js through a stubbed module loader and seed table, runs the
 * plugin's `apply` against a mock cordis context, then (a) asserts the tab-type
 * and slot registrations the shell must receive, (b) drives the conversation →
 * hunk aggregation path through the registered `canOpen`, and (c) server-renders
 * both bodies to prove the render path does not throw.
 *
 * React here is the shell's own major (18, matching dsh-web-frontend's
 * devDependency range): the plugin uses only
 * useState/useEffect/useMemo/useRef/useSyncExternalStore and createElement, so
 * the exact minor does not matter, but the major does — a React 19 renderer with
 * a React 18 element type reads as "invalid hook call".
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// react / react-dom / react/jsx-runtime are devDependencies. A checkout without
// node_modules points REACT_DIR at any directory that has all of them, so the
// harness still runs — but every React-family module must resolve the same way,
// or React and its renderer end up as two copies ("invalid hook call").
const REACT_DIR = process.env.REACT_DIR;
function requireReactModule(spec) {
	try {
		return require(spec);
	} catch (error) {
		if (!REACT_DIR) {
			throw new Error(`this test needs ${spec}: run \`npm install\` (or set REACT_DIR to a directory containing react and react-dom)`);
		}
		return require(REACT_DIR + "/" + spec);
	}
}
const React = requireReactModule("react");
const ReactDOMServer = requireReactModule("react-dom/server");
const h = React.createElement;

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

/* --- browser stubs -------------------------------------------------- */

global.document = {
	documentElement: { getAttribute: () => "zh-CN" },
	head: { appendChild() {} },
	getElementById: () => null,
	createElement: () => ({ set textContent(value) {}, id: "" })
};
// Node 24 exposes a read-only global `navigator`; the plugin only needs a
// language hint, and document.documentElement.lang already supplies one.
try {
	Object.defineProperty(global, "navigator", { value: { language: "zh-CN" }, configurable: true });
} catch (error) {
	/* keep node's own navigator */
}
global.setInterval = () => 0;
global.clearInterval = () => {};

/* --- module loader -------------------------------------------------- */

const FILE_ON_DISK = "import 'a';\n\nvoid main() {\n  run(1);\n  stop();\n}\n";
const CHANGED = FILE_ON_DISK.replace("run(1);", "run(42);");
const HUNK = {
	path: "/Users/me/proj/lib/main.dart",
	oldText: "void main() {\n  run(1);\n  stop();\n}",
	newText: "void main() {\n  run(42);\n  stop();\n}"
};
const NODES = [
	{ kind: "assistant-message", seq: 1 },
	{ kind: "tool-result", seq: 2, isError: false, meta: { diffs: [HUNK] } },
	{ kind: "tool-result", seq: 3, isError: true, meta: { diffs: [{ path: "/x.dart", oldText: "a", newText: "b" }] } },
	{ kind: "tool-result", seq: 4, isError: false, meta: { diffs: [{ path: "/bad.dart", oldText: 5, newText: "b" }] } }
];

const seed = {
	react: React,
	"react/jsx-runtime": requireReactModule("react/jsx-runtime")
};

/**
 * Evaluate the bundle in a fresh module scope. Each call gets its own state, so a
 * second call reproduces a cold plugin — which is what the strict-context
 * regression below needs.
 */
const bundle = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
function loadBundle() {
	let entry = null;
	new Function("window", bundle)({
		__ModuleLoader__: {
			load(candidate) {
				entry = candidate;
			}
		}
	});
	if (!entry) throw new Error("bundle did not register a loader entry");
	return { entry: entry, plugin: entry.factory((name) => {
		if (Object.prototype.hasOwnProperty.call(seed, name)) return seed[name];
		throw new Error("bundle required a non-seed module: " + name);
	}) };
}

const loaded = loadBundle();
const loaderEntry = loaded.entry;
// The shell's module table is keyed by the id carried in __DSH_BOOT__, which is
// the package name — a mismatch makes the plugin unresolvable in the browser.
const PKG_NAME = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).name;
check(
	"bundle registers a loader entry under the package name",
	loaderEntry !== null && loaderEntry.id === PKG_NAME,
	[loaderEntry && loaderEntry.id, PKG_NAME]
);

const plugin = loaded.plugin;
check("exports apply", typeof plugin.apply === "function");
check("exports inject", Array.isArray(plugin.inject), plugin.inject);
check(
	"declares the services it reads",
	plugin.inject.includes("uiConversation") && plugin.inject.includes("sessions"),
	plugin.inject
);

/* --- mock cordis context -------------------------------------------- */

const registrations = { tabTypes: [], slots: [], effects: [], locale: null, injected: [] };
const dictionaries = {};

function makeRemote(text) {
	const calls = [];
	return {
		calls,
		async read(sessionId, path, range, signal) {
			calls.push({ sessionId, path, range });
			return { ok: true, value: { text, lines: text.split("\n").length, eof: true, version: "v1", absolutePath: path } };
		}
	};
}

const remote = makeRemote(CHANGED);
const conversation = {
	binding(sessionId) {
		return {
			target(kind) {
				return {
					get() {
						return { legacy: { nodes: NODES } };
					},
					subscribe() {
						return () => {};
					}
				};
			}
		};
	}
};

const ctx = {
	effect(fn, label) {
		registrations.effects.push(label);
		const dispose = fn();
		return typeof dispose === "function" ? dispose : () => {};
	},
	locale: {
		register(ns, dict) {
			dictionaries[ns] = dict;
			registrations.locale = ns;
			return () => {};
		},
		bind(ns) {
			return function (key) {
				const dict = dictionaries[ns];
				return (dict && dict.zh && dict.zh[key]) || key;
			};
		},
		t(ns, key) {
			const dict = dictionaries[ns];
			return dict && dict.zh && dict.zh[key] ? dict.zh[key] : key;
		}
	},
	sidebarRightTabs: {
		register(definition) {
			registrations.tabTypes.push(definition);
			return () => {};
		}
	},
	slots: {
		inject(name, factory) {
			registrations.injected.push(name);
			return factory();
		},
		register(options, Component) {
			registrations.slots.push({ options, Component });
			return () => {};
		}
	},
	remote: { workspaceFiles: remote },
	uiConversation: conversation,
	sessions: {
		list: {
			get: () => ({
				current: "session-1",
				byId: { "session-1": { id: "session-1", cwd: "/Users/me/proj" } }
			})
		}
	},
	inject() {}
};

plugin.apply(ctx);

/* --- registrations -------------------------------------------------- */

const fileType = registrations.tabTypes.find((definition) => definition.kind === "session-diff-file");
const changesType = registrations.tabTypes.find((definition) => definition.kind === "session-diff-changes");
check("registered two tab types", registrations.tabTypes.length === 2, registrations.tabTypes.map((d) => d.kind));
check("file type claims file addresses at extension priority", !!fileType && fileType.patterns[0] === "dsh-resource://file/**" && fileType.priority === "extension", fileType && fileType.priority);
check("changes type has a guide entry", !!changesType && Array.isArray(changesType.guide) && changesType.guide.length === 1);
check("changes title follows the language", changesType.title() === "本会话改动", changesType.title());

check("registered four slot seats", registrations.slots.length === 4, registrations.slots.map((slot) => slot.options.name + ":" + slot.options.key));
const bodyKeys = registrations.slots.filter((slot) => slot.options.name === "sidebar.right.pane.tab").map((slot) => slot.options.key);
const titleKeys = registrations.slots.filter((slot) => slot.options.name === "sidebar.right.pane.tab.title").map((slot) => slot.options.key);
check("bodies keyed by definition id", bodyKeys.join(",") === "dsh-session-diff:file,dsh-session-diff:changes", bodyKeys);
check("titles keyed by definition id", titleKeys.join(",") === "dsh-session-diff:file,dsh-session-diff:changes", titleKeys);
check("slot bodies are components", registrations.slots.every((slot) => typeof slot.Component === "function"));
check("locale dictionary registered", !!dictionaries.dshSessionDiff && !!dictionaries.dshSessionDiff.zh && !!dictionaries.dshSessionDiff.en);
const zhKeys = Object.keys(dictionaries.dshSessionDiff.zh).sort().join(",");
const enKeys = Object.keys(dictionaries.dshSessionDiff.en).sort().join(",");
check("zh/en dictionaries mirror each other", zhKeys === enKeys, [zhKeys, enKeys]);

/* --- conversation → hunks → canOpen -------------------------------- */

check("claims the changed file", fileType.canOpen("dsh-resource://file/session/session-1/lib/main.dart") === true);
check("ignores an unchanged file", fileType.canOpen("dsh-resource://file/session/session-1/lib/other.dart") === false);
check("ignores absolute scope", fileType.canOpen("dsh-resource://file/absolute/tmp/x.dart") === false);
check("survives a malformed address", fileType.canOpen("nonsense") === false);
check("canOpen never claims a failed call", fileType.canOpen("dsh-resource://file/session/session-1/x.dart") === false);

/* --- regression: the shell refuses undeclared service reads --------------- *
 * The live GUI reported "failed to apply loader entry (dsh-session-diff):
 * cannot get property \"uiConversation\" without inject", so a strict context is
 * the shape that must be survived: reading an undeclared service THROWS, and the
 * injected callback is the only way in.
 * ------------------------------------------------------------------------- */

{
	const strict = loadBundle();
	const strictTypes = [];
	let injectedDeps = null;
	let deliverScoped = null;
	const strictCtx = {
		effect(fn) {
			const dispose = fn();
			return typeof dispose === "function" ? dispose : () => {};
		},
		locale: {
			register() {
				return () => {};
			},
			bind() {
				return (key) => key;
			}
		},
		sidebarRightTabs: {
			register(definition) {
				strictTypes.push(definition);
				return () => {};
			}
		},
		slots: {
			inject(name, factory) {
				factory();
				return () => {};
			},
			register() {
				return () => {};
			}
		},
		remote: { workspaceFiles: remote },
		get uiConversation() {
			throw new Error('cannot get property "uiConversation" without inject');
		},
		get sessions() {
			throw new Error('cannot get property "sessions" without inject');
		},
		inject(deps, callback) {
			injectedDeps = deps;
			deliverScoped = callback;
			return { dispose() {} };
		}
	};

	let thrown = null;
	try {
		strict.plugin.apply(strictCtx);
	} catch (error) {
		thrown = error;
	}
	check("apply survives a strict context", thrown === null, thrown && thrown.message);
	check("strict context still registers both tab types", strictTypes.length === 2, strictTypes.map((d) => d.kind));
	check(
		"strict context asks for the services through inject",
		Array.isArray(injectedDeps) && injectedDeps.includes("uiConversation") && injectedDeps.includes("sessions"),
		injectedDeps
	);
	const strictFileType = strictTypes.find((definition) => definition.kind === "session-diff-file");
	const probe = "dsh-resource://file/session/session-1/lib/main.dart";
	check("an unbound store claims nothing yet", strictFileType.canOpen(probe) === false);
	deliverScoped({
		uiConversation: conversation,
		sessions: {
			list: {
				get: () => ({ current: "session-1", byId: { "session-1": { id: "session-1", cwd: "/Users/me/proj" } } })
			}
		}
	});
	check("the injected scope binds the store", strictFileType.canOpen(probe) === true, strictFileType.canOpen(probe));
}

/* --- server-rendered bodies ---------------------------------------- */

function tabInfo(address) {
	return () => ({
		tab: {
			navigation: { address },
			actions: { openResource() {}, openTab() {} }
		},
		sessionId: "session-1"
	});
}

const fileBody = registrations.slots.find((slot) => slot.options.key === "dsh-session-diff:file").Component;
const changesBody = registrations.slots.find((slot) => slot.options.key === "dsh-session-diff:changes").Component;
const fileTitle = registrations.slots.find((slot) => slot.options.name === "sidebar.right.pane.tab.title" && slot.options.key === "dsh-session-diff:file").Component;
const changesTitle = registrations.slots.find((slot) => slot.options.name === "sidebar.right.pane.tab.title" && slot.options.key === "dsh-session-diff:changes").Component;

function render(Component, props) {
	return ReactDOMServer.renderToStaticMarkup(h(Component, props));
}

let fileMarkup = "";
let changesMarkup = "";
try {
	fileMarkup = render(fileBody, { t: (key) => key, useTabInfo: tabInfo("dsh-resource://file/session/session-1/lib/main.dart") });
	check("file body renders", fileMarkup.includes("dsd-root") && fileMarkup.includes("main.dart"), fileMarkup.slice(0, 120));
} catch (error) {
	check("file body renders", false, String(error && error.message));
}
try {
	changesMarkup = render(changesBody, { t: (key) => key, useTabInfo: tabInfo("dsh-session-diff://changes/session-1") });
	check("changes body renders", changesMarkup.includes("dsd-root"), changesMarkup.slice(0, 120));
	check("changes body lists the changed file", changesMarkup.includes("main.dart") && changesMarkup.includes("lib"), changesMarkup.slice(0, 400));
} catch (error) {
	check("changes body renders", false, String(error && error.message));
}
check("file title renders", render(fileTitle, { t: (key) => key, useTabInfo: tabInfo("dsh-resource://file/session/session-1/lib/main.dart") }).includes("main.dart"));
check("changes title renders", render(changesTitle, { t: (key) => key }).includes("本会话改动"));
// With no `t` prop at all, the namespace binding captured in apply must carry the copy.
check("changes title falls back to the bound namespace", render(changesTitle, {}).includes("本会话改动"), render(changesTitle, {}));

/* --- the standard props the real shell hands a session-scoped body -------- */

function useChatProp(selector) {
	return selector({ legacy: { nodes: NODES } });
}

// A guide-opened page: its address is the composed `sidebar://<kind>` with no
// session id, the sessionId arrives as a prop, and the chat snapshot arrives
// through the standard `useChat` selector prop.
function guideTabInfo() {
	return () => ({
		tab: {
			contentId: "sidebar://session-diff-changes",
			navigation: { address: "sidebar://session-diff-changes" },
			actions: { openResource() {}, openTab() {} }
		}
	});
}

try {
	const markup = render(changesBody, { useTabInfo: guideTabInfo, sessionId: "session-1", useChat: useChatProp });
	check("guide-opened page resolves its session from the sessionId prop", markup.includes("main.dart"), markup.slice(0, 400));
	check("guide-opened page counts the change", markup.includes("+1"), markup.slice(0, 400));
} catch (error) {
	check("guide-opened page resolves its session from the sessionId prop", false, String(error && error.message));
}
try {
	const markup = render(fileBody, {
		useTabInfo: tabInfo("dsh-resource://file/session/session-1/lib/main.dart"),
		sessionId: "session-1",
		useChat: useChatProp
	});
	check("file body renders through the useChat prop", markup.includes("dsd-root"), markup.slice(0, 200));
} catch (error) {
	check("file body renders through the useChat prop", false, String(error && error.message));
}

/* --- resilience ----------------------------------------------------- */

try {
	render(fileBody, { t: (key) => key });
	check("file body survives missing tab info", true);
} catch (error) {
	check("file body survives missing tab info", false, String(error && error.message));
}
try {
	render(changesBody, { t: (key) => key });
	check("changes body survives missing tab info", true);
} catch (error) {
	check("changes body survives missing tab info", false, String(error && error.message));
}

console.log("\n" + passed + " passed, " + failed + " failed\n");
process.exit(failed === 0 ? 0 : 1);
