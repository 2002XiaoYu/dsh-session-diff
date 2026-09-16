/**
 * Build the client bundle.
 *
 * A DSH client bundle is a single lazy-CJS file: executing it only registers a
 * factory, and the body may `require` nothing but the platform seed words
 * (react, react/jsx-runtime, react-dom, react-dom/client, @deepseek-ai/cordis,
 * @deepseek-ai/dsh-client-store, @deepseek-ai/dsh-client-ui-slots,
 * @deepseek-ai/dsh-client-ui-primitives, @deepseek-ai/dsh-client-ui-dockkit).
 * This plugin needs only React and the cordis context, so there is no bundler:
 * the bundle is the ordered concatenation of src/*.js inside one
 * `window.__ModuleLoader__.load({ id, factory })` wrapper.
 *
 * Node-only so it works on every platform the DSH CLI runs on (no bash).
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = join(root, 'src');
const outFile = join(root, 'lib', 'client.js');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

if (typeof pkg.name !== 'string' || pkg.name.length === 0) throw new Error('package.json has no name');

// The bundle's loader id must be the package name, and the bundle patch must
// resolve that same name from the profile directory. Both are checked here so a
// rename cannot ship a bundle the shell is unable to materialize.
const patchText = readFileSync(join(root, 'cordis.patch.yml'), 'utf8');
if (!patchText.includes(`name: '${pkg.name}'`) && !patchText.includes(`name: "${pkg.name}"`)) {
	throw new Error(`cordis.patch.yml does not register name: '${pkg.name}' — package.json and the patch have drifted apart`);
}

const sources = readdirSync(srcDir)
	.filter((name) => name.endsWith('.js'))
	.sort();

if (sources.length === 0) throw new Error(`no sources found in ${srcDir}`);

const parts = sources.map(
	(name) => `\n\t\t/* ==================== src/${name} ==================== */\n${readFileSync(join(srcDir, name), 'utf8')}`
);
const bundle = parts.join('').replaceAll('__PACKAGE_NAME__', pkg.name);

if (bundle.includes('__PACKAGE_NAME__')) throw new Error('a source still carries the __PACKAGE_NAME__ placeholder');
if (!bundle.includes(`id: "${pkg.name}"`)) throw new Error(`bundle loader id is not the package name (${pkg.name})`);

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, bundle);

// Compile-only check: the bundle touches `window` at run time, never at parse
// time, so constructing the function catches syntax errors without executing it.
try {
	new Function(bundle);
} catch (error) {
	throw new Error(`lib/client.js failed to compile: ${error && error.message}`);
}

// The wrapper contract the loader depends on, verified without a browser.
for (const marker of ['window.__ModuleLoader__.load(', 'exports.apply = apply', 'exports.inject = inject']) {
	if (!bundle.includes(marker) && !bundle.includes(marker.replace('exports.', 'module.exports.'))) {
		throw new Error(`lib/client.js is missing the loader contract marker: ${marker}`);
	}
}

const bytes = Buffer.byteLength(bundle);
console.log(`built lib/client.js — ${pkg.name} — ${sources.length} sources, ${(bytes / 1024).toFixed(1)} kB`);
