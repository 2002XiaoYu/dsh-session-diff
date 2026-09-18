# dsh-session-diff

Session-scoped diff decorations for the DSH Web right sidebar.

[English](README.md) | [简体中文](README.zh.md)

When you open a file that the **current conversation** changed, the sidebar renders it with
git-style added/removed line highlighting plus syntax colouring, and a companion page lists
every file this conversation touched.

![The decorated file view: session-scoped diff in the right sidebar](assets/screenshot-1.png)

## What it does

- **Decorated file view.** `write` / `edit` tool rows already open the changed file in the right
  sidebar. This plugin's tab type claims exactly those addresses (extension priority, and only
  when the session really has changes for that path), so the same click now opens a view with:
  - green/red line backgrounds and `+` / `-` gutter markers,
  - dual line-number gutters (old / new) like `git diff`,
  - syntax colouring for the whole file,
  - a header with `+added −removed`, a "changes only / whole file" toggle, a changes-only view
    that collapses long unchanged runs, and a re-read button.
- **Session changes page.** A companion tab type lists the files this conversation changed with
  per-file `+/−` counts and the containing directory; clicking an entry opens the decorated view.
  Reachable from the file view's header button and from the right sidebar's guide page.
- **Live.** Decorations follow the conversation: each new applied edit re-reads the file and
  recomputes the diff.

Files the conversation did **not** touch keep the shipped text viewer — `canOpen` only vetoes
what it actually decorates, so images, PDFs, markdown and every other document renderer behave
exactly as before.

## Install

### For users (recommended — one command)

```bash
dsh plugin --profile web add github:2002XiaoYu/dsh-session-diff   # or file:/path/to.tgz
# restart `dsh web`   (dsh.profile.bundles is read once at boot)
# hard-refresh the browser (Cmd+Shift+R)
```

There is no npm release yet, so install from the repository: `lib/` is committed next to `src/`,
which means a source install runs no build step. Once `@xiaoyu/dsh-session-diff` is on npm, the
package name works in the same command.

`dsh plugin` adds the package to the profile and, because the package declares
`dsh.bundle.patch`, registers it in `dsh.profile.bundles` as a profile layer. Uninstall is the
same one command, with no configuration editing:

```bash
dsh plugin --profile web remove @xiaoyu/dsh-session-diff
```

There is no GUI entry point for installing plugins — the Settings → Plugins page lists and
removes installed plugins, it does not add new ones.

### From source (development only)

```bash
npm run build                     # src/*.js -> lib/client.js (node, cross-platform)
bash install.sh                   # copy to ~/.dsh/plugins, symlink, add one patch-layer row
```

This path uses the profile's `cordis.patch.yml` instead of the bundle list, so `patchReload: live`
applies it without restarting `dsh web` — handy while iterating. Two rules come with it:

1. **Never mix the two paths.** If the package is already in `dsh.profile.bundles`, the manual
   patch row would insert the same loader row twice; `install.sh` refuses to run in that case.
2. **`cordis.patch.yml` must always be a top-level YAML array.** When removing the row, leave the
   file as `[]`. A comments-only file parses to `null` and `dsh web` refuses to boot with
   *"must be a top-level YAML array of loader patches"*.

Verify a profile is clean with:

```bash
dsh --profile web --dump-config | grep -c dsh-session-diff    # 0 for an uninstalled profile
```

## Requirements and compatibility

- Tested against DSH `0.1.5-rc.1` (React 18 client runtime). The browser half only ever requires
  platform seed modules — `react`, optionally `@deepseek-ai/dsh-client-ui-primitives` — and reads
  everything else from the cordis context, so it does not need React or a UI kit of its own.
- **No host-side behaviour.** The host half is an empty `apply`; the plugin never spawns a shell,
  never runs `git`, and never touches the filesystem directly. File contents are read through
  DSH's own `workspaceFiles` remote, and the diffs come from the conversation's tool results.
- No runtime dependencies, no peer dependencies, nothing to install beyond the package itself.
- After installing or upgrading, restart `dsh web`; after that, client-side changes only need a
  browser refresh.

## Scope and limits

- **Current conversation only.** The data is `write` / `edit` results in the session you are
  looking at. Changes made by another conversation, by hand, or before this conversation are not
  shown — use git for that.
- **Very long conversations lose their earliest entries.** The change list is derived from the
  client's retained conversation window; hunks whose nodes have scrolled out of that window are
  no longer listed.
- Files are read up to 20 000 lines in 600-line pages.
- Hunk paths are matched against address paths by suffix (an absolute hunk path against a
  workspace-relative address, and vice versa). A wrong match cannot lie: the hunks' own text must
  still be found in the file, otherwise the view degrades and says so.
- A hunk whose text is no longer present in the file (rewritten outside this conversation) is
  reported as unlocated; the rest still renders.
- Deleted files report a read failure instead of crashing.
- The tokenizer is a hand-written scanner covering the common languages (Dart, JS/TS, JSON, YAML,
  Python, shell, CSS, HTML/XML, Markdown, SQL, Java/Kotlin/Swift/C-family, Go, Rust, PHP).
  Unsupported suffixes render uncoloured.

## How the diff is computed

`write` / `edit` results carry `meta.diffs`, an array of `FileDiff = {path, oldText, newText}`.
Each entry is one applied hunk with three lines of context on both sides and **no line numbers**
(dsh-tool-fs builds them with `structuredPatch(..., {context: 3})`; `oldText` is `null` only when
a hunk has no old lines at all). A whole-file, git-style decoration therefore cannot be read off
the hunks directly, so:

1. the current file text is walked **backwards** through the conversation's hunks, replacing each
   hunk's `newText` with its `oldText`, which reconstructs the pre-conversation text (occurrence
   choice is hint-based, so repeated snippets resolve in place);
2. the reconstructed baseline and the current text are line-diffed with a bounded Myers diff;
3. only then are row kinds, dual gutter numbers, and `+/−` counts derived.

## Build, test, publish

```bash
npm install       # devDependencies: jsdiff (real hunk fixtures), react + react-dom (SSR harness)
npm run build     # node scripts/build.mjs -> lib/client.js (+ contract check)
npm test          # diff engine, tokenizer, addresses, bundle load, registrations, SSR bodies
```

Both harnesses take an escape hatch so they also run without `node_modules`:
`DSH_INSTALL=<a dsh install>` supplies jsdiff from a DSH installation, and
`REACT_DIR=<dir containing react and react-dom>` supplies the renderer.

`scripts/build.mjs` is deliberately not a bundler. A DSH client bundle is a single lazy-CJS file:
executing it only registers `window.__ModuleLoader__.load({id, factory})`, and the factory body may
`require` nothing but the nine platform seed words. This plugin needs nothing beyond React and the
cordis context, so the bundle is the ordered concatenation of `src/*.js` inside that wrapper.

Publishing:

```bash
npm login
npm publish --access public        # required the first time for a scoped name
```

The scope must be an npm username or organisation the publisher controls (`@xiaoyu` here);
`npm publish` fails with a 403 otherwise. The GitHub owner and the npm scope do not have to
match — this repository lives at `2002XiaoYu/dsh-session-diff`. Renaming is safe:
`scripts/build.mjs` reads the name from `package.json`, injects it as the bundle's loader id, and
fails the build if `cordis.patch.yml` still registers the old name.

`prepack` rebuilds `lib/client.js` from `src/` so the published artifact can never drift from the
sources. There is deliberately no `prepare`: npm and pnpm 10+ block lifecycle scripts for
installed dependencies, so a build-on-install would be silently skipped on a consumer's machine.
Consumers therefore never run a build — which also means **a git-based install needs `lib/`
committed**, since nothing rebuilds it there. The registry path and `dsh plugin add <file.tgz>`
are both self-contained.

## Layout

```text
src/00-head.js       loader wrapper + React requires
src/10-util.js       addresses, paths, copy, styles
src/20-tokenizer.js  dependency-free syntax scanner (maps to --shiki-token-* vars)
src/30-diff.js       hunk narrowing, baseline reconstruction, Myers line diff, row model
src/40-reader.js     whole-file read through the workspaceFiles Remote (paged)
src/50-store.js      conversation/session binding, per-file hunk aggregation, external store
src/60-ui-file.js    decorated file body + tab title
src/70-ui-changes.js session changes page + tab title
src/80-apply.js      tab-type and slot registrations
src/99-tail.js       module.exports
scripts/build.mjs    the whole build
test/                logic harness + bundle/registration/SSR harness
```
