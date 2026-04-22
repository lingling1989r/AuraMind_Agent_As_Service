#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE_NAME="${OPENCLAW_AMK_PROFILE:-}"
OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"
FROM_TARBALL=""
TARGET_VERSION=""
SOURCE_KIND="local-build"
SOURCE_SPEC=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from)
      FROM_TARBALL="${2:-}"
      SOURCE_KIND="local-tarball"
      shift 2
      ;;
    --version)
      TARGET_VERSION="${2:-}"
      SOURCE_KIND="registry-version"
      shift 2
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
      echo "Usage: bash scripts/upgrade.sh [--from <tarball>] [--version <version>] [--profile <name>] [--openclaw-home <path>]" >&2
      exit 1
      ;;
  esac
done

if [[ -n "$FROM_TARBALL" && -n "$TARGET_VERSION" ]]; then
  echo "ERROR: --from and --version cannot be used together" >&2
  exit 1
fi

cd "$ROOT_DIR"

PLUGIN_NAME="$(node -p "require('./package.json').name")"
PLUGIN_ID="$(node --input-type=module -e "import { DEFAULT_PLUGIN_ID } from './src/config.js'; process.stdout.write(DEFAULT_PLUGIN_ID)")"
INSTALL_DIR="$OPENCLAW_HOME/extensions/$PLUGIN_NAME"
TMP_PACK_DIR=""
TARBALL_PATH=""

if [[ -n "$PROFILE_NAME" ]]; then
  PROFILE_CONFIG="$HOME/.openclaw-$PROFILE_NAME/openclaw.json"
else
  PROFILE_CONFIG="$OPENCLAW_HOME/openclaw.json"
fi

CONFIG_BACKUP=""
if [[ -f "$PROFILE_CONFIG" ]]; then
  CONFIG_BACKUP="$PROFILE_CONFIG.bak.$(date +%Y%m%d%H%M%S)"
  cp "$PROFILE_CONFIG" "$CONFIG_BACKUP"
  echo "Backed up config: $CONFIG_BACKUP"
fi

cleanup() {
  if [[ -n "$TMP_PACK_DIR" && -d "$TMP_PACK_DIR" ]]; then
    rm -rf "$TMP_PACK_DIR"
  fi
}
trap cleanup EXIT

if [[ "$SOURCE_KIND" == "local-tarball" ]]; then
  if [[ ! -f "$FROM_TARBALL" ]]; then
    echo "ERROR: tarball not found: $FROM_TARBALL" >&2
    exit 1
  fi
  TARBALL_PATH="$FROM_TARBALL"
  SOURCE_SPEC="$FROM_TARBALL"
elif [[ "$SOURCE_KIND" == "registry-version" ]]; then
  TMP_PACK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/openclaw-amk-upgrade.XXXXXX")"
  SOURCE_SPEC="$PLUGIN_NAME@$TARGET_VERSION"
  npm pack "$SOURCE_SPEC" --pack-destination "$TMP_PACK_DIR" >/tmp/openclaw-amk-pack.log
  TARBALL_PATH="$(ls "$TMP_PACK_DIR"/*.tgz 2>/dev/null | head -1)"
  if [[ -z "$TARBALL_PATH" || ! -f "$TARBALL_PATH" ]]; then
    echo "ERROR: failed to download package: $SOURCE_SPEC" >&2
    exit 1
  fi
else
  npm pack >/tmp/openclaw-amk-pack.log
  TARBALL_PATH="$ROOT_DIR/$(node -p "require('./package.json').name + '-' + require('./package.json').version + '.tgz'")"
  SOURCE_SPEC="$TARBALL_PATH"
  if [[ ! -f "$TARBALL_PATH" ]]; then
    echo "ERROR: tarball not found: $TARBALL_PATH" >&2
    exit 1
  fi
fi

UNINSTALL_ARGS=()
if [[ -n "$PROFILE_NAME" ]]; then
  UNINSTALL_ARGS+=(--profile "$PROFILE_NAME")
fi
if [[ -n "$OPENCLAW_HOME" ]]; then
  UNINSTALL_ARGS+=(--openclaw-home "$OPENCLAW_HOME")
fi
bash "$ROOT_DIR/scripts/uninstall.sh" "${UNINSTALL_ARGS[@]}"

if [[ -n "$PROFILE_NAME" ]]; then
  openclaw --profile "$PROFILE_NAME" plugins install "$TARBALL_PATH"
  openclaw --profile "$PROFILE_NAME" config validate
else
  openclaw plugins install "$TARBALL_PATH"
  openclaw config validate
fi

if [[ ! -d "$INSTALL_DIR" ]]; then
  echo "ERROR: plugin install dir not found: $INSTALL_DIR" >&2
  exit 1
fi

node -e '
const fs = require("fs");
const configPath = process.argv[1];
const pluginId = process.argv[2];
const installPath = process.argv[3];
const sourceKind = process.argv[4];
const sourceSpec = process.argv[5];
if (!fs.existsSync(configPath)) process.exit(0);
const raw = fs.readFileSync(configPath, "utf8");
const data = JSON.parse(raw);
if (!data.plugins || typeof data.plugins !== "object" || Array.isArray(data.plugins)) data.plugins = {};
if (!Array.isArray(data.plugins.allow)) data.plugins.allow = [];
if (!data.plugins.allow.includes(pluginId)) data.plugins.allow.push(pluginId);
if (!data.plugins.entries || typeof data.plugins.entries !== "object") data.plugins.entries = {};
if (!data.plugins.entries[pluginId] || typeof data.plugins.entries[pluginId] !== "object") data.plugins.entries[pluginId] = {};
data.plugins.entries[pluginId].enabled = true;
if (!data.plugins.installs || typeof data.plugins.installs !== "object") data.plugins.installs = {};
let resolvedName = "";
let resolvedVersion = "";
const pkgJsonPath = `${installPath}/package.json`;
if (fs.existsSync(pkgJsonPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
  resolvedName = pkg.name || "";
  resolvedVersion = pkg.version || "";
}
const pinnedSpec = resolvedName && resolvedVersion ? `${resolvedName}@${resolvedVersion}` : sourceSpec || pluginId;
const installSource = sourceKind === "registry-version" ? "npm" : "archive";
data.plugins.installs[pluginId] = {
  source: installSource,
  spec: sourceSpec || pinnedSpec,
  installPath,
  ...(resolvedVersion ? { version: resolvedVersion } : {}),
  ...(resolvedName ? { resolvedName } : {}),
  ...(resolvedVersion ? { resolvedVersion } : {}),
  ...(resolvedName && resolvedVersion ? { resolvedSpec: pinnedSpec } : {}),
  installedAt: new Date().toISOString(),
};
fs.writeFileSync(configPath, `${JSON.stringify(data, null, 2)}\n`);
' "$PROFILE_CONFIG" "$PLUGIN_ID" "$INSTALL_DIR" "$SOURCE_KIND" "$SOURCE_SPEC"

if [[ -f "$PROFILE_CONFIG" ]]; then
  echo "Config: $PROFILE_CONFIG"
fi

echo "Install: $INSTALL_DIR"
echo "Upgrade source: $SOURCE_KIND"
echo "Upgrade spec: $SOURCE_SPEC"
echo "Upgrade finished with tarball: $TARBALL_PATH"
