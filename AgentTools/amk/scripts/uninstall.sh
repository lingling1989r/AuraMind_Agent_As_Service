#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE_NAME="${OPENCLAW_AMK_PROFILE:-}"
OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"
PURGE="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --purge)
      PURGE="true"
      shift
      ;;
    --profile)
      PROFILE_NAME="${2:-}"
      shift 2
      ;;
    --openclaw-home)
      OPENCLAW_HOME="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: bash scripts/uninstall.sh [--purge] [--profile <name>] [--openclaw-home <path>]" >&2
      exit 1
      ;;
  esac
done

cd "$ROOT_DIR"

PLUGIN_NAME="$(node -p "require('./package.json').name")"
PLUGIN_ID="$(node --input-type=module -e "import { DEFAULT_PLUGIN_ID } from './src/config.js'; process.stdout.write(DEFAULT_PLUGIN_ID)")"
INSTALL_DIR="$OPENCLAW_HOME/extensions/$PLUGIN_NAME"
DEFAULT_DATA_ROOT="$(node --input-type=module -e "import { getDefaultStorageRoot } from './src/config.js'; process.stdout.write(getDefaultStorageRoot())")"
WORKSPACE_DATA_ROOT="$ROOT_DIR/.openclaw-amk"

if [[ -d "$INSTALL_DIR" ]]; then
  rm -rf "$INSTALL_DIR"
  echo "Removed plugin files: $INSTALL_DIR"
else
  echo "Plugin files already absent: $INSTALL_DIR"
fi

if [[ "$PURGE" != "true" ]]; then
  echo "Kept OpenClaw config and user data for: $PLUGIN_ID"
  echo "Uninstall finished for: $PLUGIN_NAME"
  exit 0
fi

if [[ -n "$PROFILE_NAME" ]]; then
  PROFILE_CONFIG="$HOME/.openclaw-$PROFILE_NAME/openclaw.json"
else
  PROFILE_CONFIG="$OPENCLAW_HOME/openclaw.json"
fi

if [[ -f "$PROFILE_CONFIG" ]]; then
  node -e '
const fs = require("fs");
const configPath = process.argv[1];
const pluginId = process.argv[2];
const raw = fs.readFileSync(configPath, "utf8");
const data = JSON.parse(raw);
let changed = false;
if (Array.isArray(data?.plugins?.allow)) {
  const next = data.plugins.allow.filter((entry) => entry !== pluginId);
  if (next.length !== data.plugins.allow.length) {
    data.plugins.allow = next;
    changed = true;
  }
}
if (data?.plugins?.entries && Object.prototype.hasOwnProperty.call(data.plugins.entries, pluginId)) {
  delete data.plugins.entries[pluginId];
  changed = true;
}
if (data?.plugins?.installs && Object.prototype.hasOwnProperty.call(data.plugins.installs, pluginId)) {
  delete data.plugins.installs[pluginId];
  changed = true;
}
if (data?.plugins?.slots?.memory === pluginId) {
  delete data.plugins.slots.memory;
  changed = true;
  if (Object.keys(data.plugins.slots).length === 0) {
    delete data.plugins.slots;
  }
}
if (changed) {
  fs.writeFileSync(configPath, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Removed plugin config for ${pluginId} from ${configPath}`);
} else {
  console.log(`No plugin config to remove for ${pluginId} in ${configPath}`);
}
' "$PROFILE_CONFIG" "$PLUGIN_ID"
else
  echo "Config file not found, skipped config cleanup: $PROFILE_CONFIG"
fi

if [[ -d "$DEFAULT_DATA_ROOT" ]]; then
  rm -rf "$DEFAULT_DATA_ROOT"
  echo "Removed default data root: $DEFAULT_DATA_ROOT"
fi

if [[ -d "$WORKSPACE_DATA_ROOT" ]]; then
  rm -rf "$WORKSPACE_DATA_ROOT"
  echo "Removed workspace-local session data: $WORKSPACE_DATA_ROOT"
fi

echo "Purge finished for: $PLUGIN_NAME"
