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
