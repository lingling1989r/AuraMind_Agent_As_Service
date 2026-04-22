#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE_NAME="${OPENCLAW_AMK_PROFILE:-amk-smoke-test}"
TARBALL=""
TMP_HOME=""

cleanup() {
  if [[ -n "$TMP_HOME" && -d "$TMP_HOME" ]]; then
    rm -rf "$TMP_HOME"
  fi
}

trap cleanup EXIT

cd "$ROOT_DIR"

npm pack >/tmp/openclaw-amk-pack.log
TARBALL="$(node -p "require('./package.json').name + '-' + require('./package.json').version + '.tgz'")"
TMP_HOME="$(mktemp -d "${TMPDIR:-/tmp}/openclaw-amk-home.XXXXXX")"

if [[ ! -f "$ROOT_DIR/$TARBALL" ]]; then
  echo "ERROR: tarball not found: $ROOT_DIR/$TARBALL" >&2
  exit 1
fi

HOME="$TMP_HOME" openclaw --profile "$PROFILE_NAME" plugins install "$ROOT_DIR/$TARBALL"
HOME="$TMP_HOME" openclaw --profile "$PROFILE_NAME" config validate

PROFILE_CONFIG="$TMP_HOME/.openclaw-$PROFILE_NAME/openclaw.json"
INSTALL_DIR="$TMP_HOME/.openclaw/extensions/openclaw-amk"

if [[ ! -f "$PROFILE_CONFIG" ]]; then
  echo "ERROR: profile config not found: $PROFILE_CONFIG" >&2
  exit 1
fi

if [[ ! -d "$INSTALL_DIR" ]]; then
  echo "ERROR: plugin install dir not found: $INSTALL_DIR" >&2
  exit 1
fi

if ! grep -q '"openclaw-amk"' "$PROFILE_CONFIG"; then
  echo "ERROR: plugin entry missing in $PROFILE_CONFIG" >&2
  exit 1
fi

node -e '
const fs = require("fs");
const configPath = process.argv[1];
const pluginId = process.argv[2];
const raw = fs.readFileSync(configPath, "utf8");
const data = JSON.parse(raw);
if (!data.plugins || typeof data.plugins !== "object" || Array.isArray(data.plugins)) data.plugins = {};
if (!Array.isArray(data.plugins.allow)) data.plugins.allow = [];
if (!data.plugins.allow.includes(pluginId)) data.plugins.allow.push(pluginId);
if (!data.plugins.entries || typeof data.plugins.entries !== "object") data.plugins.entries = {};
if (!data.plugins.entries[pluginId] || typeof data.plugins.entries[pluginId] !== "object") data.plugins.entries[pluginId] = {};
data.plugins.entries[pluginId].enabled = true;
if (!data.plugins.slots || typeof data.plugins.slots !== "object" || Array.isArray(data.plugins.slots)) data.plugins.slots = {};
data.plugins.slots.memory = pluginId;
fs.writeFileSync(configPath, `${JSON.stringify(data, null, 2)}\n`);
' "$PROFILE_CONFIG" "openclaw-amk"

HOME="$TMP_HOME" openclaw --profile "$PROFILE_NAME" config validate

if ! grep -q '"memory": "openclaw-amk"' "$PROFILE_CONFIG"; then
  echo "ERROR: memory slot binding missing in $PROFILE_CONFIG" >&2
  exit 1
fi

echo "OK: OpenClaw AMK install smoke passed"
echo "Profile: $PROFILE_NAME"
echo "Config: $PROFILE_CONFIG"
echo "Install: $INSTALL_DIR"
echo "Memory slot: openclaw-amk"
