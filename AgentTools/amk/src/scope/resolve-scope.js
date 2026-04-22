import path from 'node:path';
import { hashScopeId } from '../utils/hash-id.js';
import { ISOLATION_MODES, SCOPE_TYPES } from '../types.js';

function resolveSessionIdentity(context = {}) {
  return context.sessionId || context.chatId || context.groupId || context.channelId;
}

function resolveSessionRoutingSource(context = {}) {
  return context.sessionId
    ? 'sessionId'
    : context.chatId
      ? 'chatId'
      : context.groupId
        ? 'groupId'
        : 'channelId';
}

function normalizePathSegment(value, fallback) {
  const normalized = String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_');
  return normalized || fallback;
}

function resolveUserIdentity(context = {}) {
  if (context.platform === 'feishu' || context.feishuUserId) {
    if (!context.feishuUserId) {
      throw new Error('feishuUserId is required when platform=feishu and isolationMode=user');
    }

    return {
      platform: 'feishu',
      platformUserId: String(context.feishuUserId),
      scopeIdentity: `feishu:${context.feishuUserId}`,
      routingSource: 'feishuUserId',
    };
  }

  if (context.userId) {
    const platform = context.platform ? String(context.platform) : 'generic';
    return {
      platform,
      platformUserId: String(context.userId),
      scopeIdentity: `${platform}:${context.userId}`,
      routingSource: 'userId',
    };
  }

  throw new Error('feishuUserId or userId is required when isolationMode=user');
}

export function resolveScope(context, config) {
  if (!config?.enabled) {
    throw new Error('AMK plugin is disabled');
  }

  const runtimeContext = context || {};
  const isolationMode = config.isolationMode;
  const agentId = runtimeContext.agentId || 'default-agent';
  const agentPathSegment = normalizePathSegment(agentId, 'default-agent');
  const transcriptIdentity = resolveSessionIdentity(runtimeContext);
  const transcriptRoutingSource = transcriptIdentity ? resolveSessionRoutingSource(runtimeContext) : null;
  const transcriptFileName = transcriptIdentity ? `${hashScopeId(`transcript:${transcriptIdentity}`)}.jsonl` : 'messages.jsonl';

  let scopeType;
  let scopeId;
  let routingSource;
  let scopePath;
  let fileRoot;
  let memoryNamespace;
  let platform = runtimeContext.platform ? String(runtimeContext.platform) : null;
  let platformUserId = runtimeContext.userId ? String(runtimeContext.userId) : null;
  let feishuUserId = runtimeContext.feishuUserId ? String(runtimeContext.feishuUserId) : null;

  if (isolationMode === ISOLATION_MODES.USER) {
    const userIdentity = resolveUserIdentity(runtimeContext);
    const platformPathSegment = normalizePathSegment(userIdentity.platform, 'generic');

    scopeType = SCOPE_TYPES.USER;
    scopeId = `${agentId}:${userIdentity.scopeIdentity}`;
    routingSource = userIdentity.routingSource;
    platform = userIdentity.platform;
    platformUserId = userIdentity.platformUserId;
    feishuUserId = userIdentity.platform === 'feishu' ? userIdentity.platformUserId : feishuUserId;

    const scopeHash = hashScopeId(`${scopeType}:${scopeId}`);
    scopePath = path.join(config.storage.root, 'agents', agentPathSegment, 'users', platformPathSegment, scopeHash);
    fileRoot = runtimeContext.workspacePath
      ? path.join(runtimeContext.workspacePath, 'users', platformPathSegment, scopeHash, 'files')
      : path.join(scopePath, 'files');
    memoryNamespace = `user:${platformPathSegment}:${agentPathSegment}:${scopeHash}`;

    return {
      scopeType,
      scopeId,
      scopeHash,
      routingSource,
      scopePath,
      fileRoot,
      profileRoot: path.join(scopePath, 'profile'),
      memoryRoot: path.join(scopePath, 'memory'),
      transcriptRoot: path.join(scopePath, 'transcripts'),
      metadataRoot: path.join(scopePath, 'metadata'),
      kbRoot: path.join(scopePath, 'kb'),
      memoryNamespace,
      workspacePath: runtimeContext.workspacePath || null,
      agentId,
      channelId: runtimeContext.channelId || null,
      userId: platformUserId,
      platform,
      feishuUserId,
      sessionId: runtimeContext.sessionId || null,
      transcriptIdentity: transcriptIdentity ? String(transcriptIdentity) : null,
      transcriptRoutingSource,
      transcriptFileName,
      transcriptFilePath: path.join(path.join(scopePath, 'transcripts'), transcriptFileName),
    };
  }

  const sessionIdentity = resolveSessionIdentity(runtimeContext);
  if (!sessionIdentity) {
    throw new Error('sessionId, chatId, groupId, or channelId is required when isolationMode=session');
  }

  scopeType = SCOPE_TYPES.SESSION;
  scopeId = String(sessionIdentity);
  routingSource = resolveSessionRoutingSource(runtimeContext);

  const scopeHash = hashScopeId(`${scopeType}:${scopeId}`);
  const usesWorkspaceLocal =
    config.sessionStorage.preferWorkspaceLocal && runtimeContext.workspacePath;

  scopePath = usesWorkspaceLocal
    ? path.join(runtimeContext.workspacePath, '.openclaw-amk', 'sessions', scopeHash)
    : path.join(config.storage.root, 'scopes', 'sessions', scopeHash);
  fileRoot = path.join(scopePath, 'files');
  memoryNamespace = `${scopeType}:${scopeHash}`;

  return {
    scopeType,
    scopeId,
    scopeHash,
    routingSource,
    scopePath,
    fileRoot,
    profileRoot: path.join(scopePath, 'profile'),
    memoryRoot: path.join(scopePath, 'memory'),
    transcriptRoot: path.join(scopePath, 'transcripts'),
    metadataRoot: path.join(scopePath, 'metadata'),
    kbRoot: path.join(scopePath, 'kb'),
    memoryNamespace,
    workspacePath: runtimeContext.workspacePath || null,
    agentId: runtimeContext.agentId || null,
    channelId: runtimeContext.channelId || null,
    userId: runtimeContext.userId || null,
    platform,
    feishuUserId,
    sessionId: runtimeContext.sessionId || null,
    transcriptIdentity: transcriptIdentity ? String(transcriptIdentity) : null,
    transcriptRoutingSource,
    transcriptFileName,
    transcriptFilePath: path.join(path.join(scopePath, 'transcripts'), transcriptFileName),
  };
}
