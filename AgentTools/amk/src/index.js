import { resolveAmkConfig } from './config.js';
import { resolveScope as resolveScopeModel } from './scope/resolve-scope.js';
import { ensureScopeStorage } from './storage/ensure-scope-storage.js';
import { listScopeFiles, readScopeFile, writeScopeFile } from './storage/file-operations.js';
import { writeProfileRecord, readProfileRecord } from './storage/profile-store.js';
import { appendTranscriptEntry, readTranscript } from './storage/transcript-store.js';
import { createToolRegistry } from './runtime/tool-registry.js';

export function createAmkPlugin(inputConfig = {}) {
  const config = resolveAmkConfig(inputConfig);

  async function prepareScope(context) {
    const scope = resolveScopeModel(context, config);
    await ensureScopeStorage(scope);
    return scope;
  }

  async function initUserScope(context, payload = {}) {
    const scope = await prepareScope(context);

    if (scope.scopeType !== 'user') {
      throw new Error('initUserScope requires a user scope');
    }

    let profile = await readProfileRecord(scope, { recordType: 'profile' });
    let prove = await readProfileRecord(scope, { recordType: 'prove' });
    const initialized = {
      profile: false,
      prove: false,
    };

    if (profile.data === null) {
      await writeProfileRecord(scope, {
        recordType: 'profile',
        data: payload.profile ?? null,
      });
      profile = await readProfileRecord(scope, { recordType: 'profile' });
      initialized.profile = true;
    }

    if (prove.data === null) {
      await writeProfileRecord(scope, {
        recordType: 'prove',
        data: payload.prove ?? null,
      });
      prove = await readProfileRecord(scope, { recordType: 'prove' });
      initialized.prove = true;
    }

    return {
      scope,
      profile,
      prove,
      memoryNamespace: scope.memoryNamespace,
      initialized,
    };
  }

  async function prepareUserTurn(context, message) {
    const initializedScope = await initUserScope(context);
    const transcriptWrite = await appendTranscriptEntry(initializedScope.scope, {
      role: 'user',
      content: message.content,
      ...(message.ts ? { ts: message.ts } : {}),
    });

    return {
      scope: initializedScope.scope,
      profile: initializedScope.profile,
      prove: initializedScope.prove,
      memoryNamespace: initializedScope.memoryNamespace,
      initialized: initializedScope.initialized,
      transcriptWrite,
    };
  }

  async function commitAssistantTurn(context, message) {
    const initializedScope = await initUserScope(context);
    const transcriptWrite = await appendTranscriptEntry(initializedScope.scope, {
      role: 'assistant',
      content: message.content,
      ...(message.ts ? { ts: message.ts } : {}),
    });

    return {
      scope: initializedScope.scope,
      memoryNamespace: initializedScope.memoryNamespace,
      transcriptWrite,
    };
  }

  return {
    config,
    resolveScope(context) {
      return resolveScopeModel(context, config);
    },
    async ensureScopeStorage(contextOrScope) {
      const scope = contextOrScope.scopeType ? contextOrScope : resolveScopeModel(contextOrScope, config);
      return ensureScopeStorage(scope);
    },
    async initUserScope(context, payload) {
      return initUserScope(context, payload);
    },
    async prepareUserTurn(context, message) {
      return prepareUserTurn(context, message);
    },
    async commitAssistantTurn(context, message) {
      return commitAssistantTurn(context, message);
    },
    async listScopeFiles(context, options) {
      const scope = await prepareScope(context);
      return listScopeFiles(scope, options);
    },
    async readScopeFile(context, resourceRef) {
      const scope = await prepareScope(context);
      return readScopeFile(scope, resourceRef);
    },
    async writeScopeFile(context, payload) {
      const scope = await prepareScope(context);
      return writeScopeFile(scope, payload);
    },
    async writeProfileRecord(context, payload) {
      const scope = await prepareScope(context);
      return writeProfileRecord(scope, payload);
    },
    async readProfileRecord(context, resourceRef) {
      const scope = await prepareScope(context);
      return readProfileRecord(scope, resourceRef);
    },
    async appendTranscriptEntry(context, entry) {
      const scope = await prepareScope(context);
      return appendTranscriptEntry(scope, entry);
    },
    async readTranscript(context) {
      const scope = await prepareScope(context);
      return readTranscript(scope);
    },
    getMemoryNamespace(context) {
      return resolveScopeModel(context, config).memoryNamespace;
    },
    createToolRegistry() {
      return createToolRegistry(this);
    },
  };
}
