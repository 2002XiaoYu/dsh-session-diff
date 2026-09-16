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
	id: "__PACKAGE_NAME__",
	factory: (require) => {
		var module = { exports: {} };
		const React = require("react");
		const h = React.createElement;
		const useState = React.useState;
		const useEffect = React.useEffect;
		const useMemo = React.useMemo;
		const useRef = React.useRef;
		const useSyncExternalStore = React.useSyncExternalStore;
