import path from 'node:path';
import os from 'node:os';
import { ISOLATION_MODES } from './types.js';

export const DEFAULT_OPENCLAW_DATA_DIRNAME = '.openclaw';
export const DEFAULT_PLUGIN_ID = 'openclaw-amk';

export const DEFAULT_AMK_CONFIG = {
  enabled: true,
  isolationMode: ISOLATION_MODES.USER,
  sessionStorage: {
    preferWorkspaceLocal: true,
  },
  transcript: {
    enabled: true,
  },
  memory: {
    enabled: true,
  },
};

export function getDefaultOpenClawDataRoot() {
  return path.join(os.homedir(), DEFAULT_OPENCLAW_DATA_DIRNAME);
}

export function getDefaultStorageRoot(openclawDataRoot = getDefaultOpenClawDataRoot()) {
  return path.join(openclawDataRoot, 'plugins', DEFAULT_PLUGIN_ID);
}

export function resolveAmkConfig(input = {}) {
  const openclawDataRoot = input.openclawDataRoot || getDefaultOpenClawDataRoot();
  const storageRoot = input.storage?.root || getDefaultStorageRoot(openclawDataRoot);
  const isolationMode = input.isolationMode || DEFAULT_AMK_CONFIG.isolationMode;

  if (!Object.values(ISOLATION_MODES).includes(isolationMode)) {
    throw new Error(`Unsupported isolation mode: ${isolationMode}`);
  }

  return {
    enabled: input.enabled ?? DEFAULT_AMK_CONFIG.enabled,
    isolationMode,
    openclawDataRoot,
    storage: {
      root: storageRoot,
    },
    sessionStorage: {
      preferWorkspaceLocal:
        input.sessionStorage?.preferWorkspaceLocal ?? DEFAULT_AMK_CONFIG.sessionStorage.preferWorkspaceLocal,
    },
    transcript: {
      enabled: input.transcript?.enabled ?? DEFAULT_AMK_CONFIG.transcript.enabled,
    },
    memory: {
      enabled: input.memory?.enabled ?? DEFAULT_AMK_CONFIG.memory.enabled,
    },
  };
}
