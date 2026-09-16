#!/usr/bin/env bash
# Install dsh-session-diff into a DSH profile FROM SOURCE (development path).
#
# This is the "hacking on the plugin" installer: it copies the package into
# ~/.dsh/plugins, links it into the profile's node_modules, and adds ONE row to
# the profile's cordis.patch.yml. `patchReload: live` picks that row up without
# restarting `dsh web`, which is why it is convenient while developing.
#
# For a normal install (what other people should do), do NOT use this script:
#
#     dsh plugin --profile web add <package-or-tarball>
#
# That registers the package as a profile bundle through its own
# cordis.patch.yml. The two paths must never be combined: both insert the same
# loader row, and a duplicate id is a boot error. This script therefore refuses
# to run when the profile already lists the package.
#
# Writes outside the session workspace (~/.dsh), so it needs full file access.
set -euo pipefail

SRC="${1:-$(cd "$(dirname "$0")" && pwd)}"
HOME_DIR="$HOME"
PLUGIN_DIR="$HOME_DIR/.dsh/plugins/dsh-session-diff"
PROFILE_DIR="$HOME_DIR/.dsh/profiles/web"
PATCH="$PROFILE_DIR/cordis.patch.yml"
BACKUP="$PATCH.bak-dsh-session-diff"
DSH_NODE_MODULES="$HOME_DIR/.nvm/versions/node/v24.19.0/lib/node_modules/@deepseek-ai/dsh/node_modules"

echo "==> source: $SRC"
[ -f "$SRC/lib/client.js" ] || { echo "missing $SRC/lib/client.js — run 'npm run build' first" >&2; exit 1; }
[ -f "$PROFILE_DIR/package.json" ] || { echo "profile not found at $PROFILE_DIR" >&2; exit 1; }

if grep -q "dsh-session-diff" "$PROFILE_DIR/package.json" 2>/dev/null; then
	echo "!! $PROFILE_DIR/package.json already lists dsh-session-diff." >&2
	echo "!! It was installed as a profile bundle (dsh plugin add), which is the supported path." >&2
	echo "!! This script installs the same plugin through the patch layer instead; doing both" >&2
	echo "!! would insert the same loader row twice. Remove it from dsh.profile.bundles first," >&2
	echo "!! or simply keep using 'dsh plugin --profile web remove dsh-session-diff'." >&2
	exit 1
fi

echo "==> staging plugin into $PLUGIN_DIR"
mkdir -p "$PLUGIN_DIR"
rm -rf "$PLUGIN_DIR/lib" "$PLUGIN_DIR/src" "$PLUGIN_DIR/scripts"
rm -f "$PLUGIN_DIR/build.sh"   # superseded by scripts/build.mjs (cross-platform)
cp -R "$SRC/lib" "$SRC/src" "$SRC/scripts" "$PLUGIN_DIR/"
cp "$SRC/package.json" "$SRC/cordis.patch.yml" "$SRC/README.md" "$SRC/LICENSE" "$SRC/install.sh" "$PLUGIN_DIR/"
[ -d "$SRC/test" ] && { rm -rf "$PLUGIN_DIR/test"; cp -R "$SRC/test" "$PLUGIN_DIR/"; }

echo "==> linking into the profile"
ln -sfn "$PLUGIN_DIR" "$PROFILE_DIR/node_modules/dsh-session-diff"
ls -l "$PROFILE_DIR/node_modules/dsh-session-diff" | sed 's/^/    /'

echo "==> resolving the host half from the profile"
(cd "$PROFILE_DIR" && node -e "import('dsh-session-diff').then(m => console.log('    host apply:', typeof m.apply)).catch(e => { console.error('    FAILED:', e.code || e.message); process.exit(1); })")

echo "==> patching $PATCH"
if [ ! -f "$BACKUP" ]; then cp "$PATCH" "$BACKUP"; echo "    backup: $BACKUP"; fi
python3 - "$PATCH" "$SRC/package.json" <<'PY'
import sys, pathlib, json
path = pathlib.Path(sys.argv[1])
pkg_name = json.loads(pathlib.Path(sys.argv[2]).read_text())["name"]
entry = (
    "\n# dsh-session-diff — session-scoped diff decorations for the right sidebar.\n"
    "# To uninstall: delete this entry (and the node_modules symlink) and leave the\n"
    "# file as an empty top-level array ([]); a comments-only file is a boot error.\n"
    "- insert:\n"
    "    - id: dsh-session-diff\n"
    f"      name: '{pkg_name}'\n"
)
text = path.read_text()
if "id: dsh-session-diff" in text:
    print("    already present, left untouched")
    sys.exit(0)
lines = [line for line in text.splitlines() if line.strip() != "[]"]
path.write_text("\n".join(lines).rstrip("\n") + "\n" + entry)
print(f"    entry added (name: {pkg_name})")
PY

echo "==> validating the patch layer YAML"
NODE_PATH="$DSH_NODE_MODULES" node -e "
const fs = require('fs');
const yaml = require('$DSH_NODE_MODULES/js-yaml');
const pkgName = JSON.parse(fs.readFileSync('$SRC/package.json', 'utf8')).name;
const doc = yaml.load(fs.readFileSync('$PATCH', 'utf8'));
if (!Array.isArray(doc)) { console.error('    FAILED: patch layer is not a list'); process.exit(1); }
const hit = doc.some((item) => item && Array.isArray(item.insert) && item.insert.some((row) => row && row.name === pkgName));
console.log('    entries:', doc.length, '| row for', pkgName + ':', hit);
if (!hit) process.exit(1);
"

echo "==> done. Hard-refresh the GUI (Cmd+Shift+R)."
