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
