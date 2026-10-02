#!/bin/bash
#
# Xcode Cloud runs this right after cloning the repository and BEFORE it
# resolves Swift packages. A fresh clone has no node_modules (gitignored), but
# ios/App/CapApp-SPM/Package.swift points at
#   <repo>/node_modules/@exxili/capacitor-nfc
# as a local Swift package, and the Capacitor-generated files the app needs at
# runtime (App/App/capacitor.config.json, App/App/public) are gitignored too.
# So: install npm dependencies (which runs the plugin's postinstall fixes),
# then `cap sync ios`, so everything exists before Xcode looks for it.
#
# Local Xcode builds are unaffected: Xcode ignores this folder.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# <repo>/apps/web/ios/App/ci_scripts -> <repo>
REPO_ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$SCRIPT_DIR/../../../../.." && pwd)}"
WEB_DIR="$REPO_ROOT/apps/web"
PLUGIN_DIR="$REPO_ROOT/node_modules/@exxili/capacitor-nfc"
NODE_FORMULA="node@22"

log() { echo "[ci_post_clone] $*"; }
fail() { echo "[ci_post_clone] ERROR: $*" >&2; exit 1; }

# @capacitor/cli 8.x refuses to run on Node < 22 (stricter than the repo's
# "engines" field), and `cap sync ios` below needs it.
node_ok() {
  command -v node >/dev/null 2>&1 && node -e '
    process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1);'
}

export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
if ! node_ok; then
  log "Node >= 22 not found; installing $NODE_FORMULA with Homebrew"
  HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_CLEANUP=1 brew install "$NODE_FORMULA"
  export PATH="$(brew --prefix "$NODE_FORMULA")/bin:$PATH"
  node_ok || fail "Node >= 22 is still not available after installing $NODE_FORMULA"
fi
log "node $(node -v), npm $(npm -v)"

# 1. Install the workspace (hoists @exxili/capacitor-nfc to <repo>/node_modules
#    and runs apps/web's `postinstall`, fix-capacitor-nfc-plugin.mjs).
cd "$REPO_ROOT"
log "npm ci"
npm ci --workspace=@moments-forever/web --include-workspace-root --no-audit --no-fund

# 2. Make sure the plugin patches are applied even if npm skipped lifecycle
#    scripts. The script is idempotent ("already patched — nothing to do").
node "$WEB_DIR/scripts/fix-capacitor-nfc-plugin.mjs"

[ -f "$PLUGIN_DIR/Package.swift" ] || fail "$PLUGIN_DIR/Package.swift is missing after npm ci"
grep -q 'name: "ExxiliCapacitorNfc"' "$PLUGIN_DIR/Package.swift" \
  || fail "@exxili/capacitor-nfc Package.swift was not patched (expected product ExxiliCapacitorNfc)"

# 3. Generate what is gitignored but required to build: capacitor.config.json,
#    the copied web assets, and CapApp-SPM/Package.swift.
cd "$WEB_DIR"
log "cap sync ios"
npx --no-install cap sync ios

CONFIG_JSON="$WEB_DIR/ios/App/App/capacitor.config.json"
[ -f "$CONFIG_JSON" ] || fail "$CONFIG_JSON was not generated"
grep -q 'NFCPlugin' "$CONFIG_JSON" || fail "NFCPlugin is missing from packageClassList in $CONFIG_JSON"
grep -q 'ExxiliCapacitorNfc' "$WEB_DIR/ios/App/CapApp-SPM/Package.swift" \
  || fail "CapApp-SPM/Package.swift does not reference ExxiliCapacitorNfc"

log "done: Swift packages can be resolved"
