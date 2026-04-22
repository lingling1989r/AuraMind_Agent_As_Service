import fs from 'node:fs/promises';
import path from 'node:path';
import { createAmkPlugin } from './src/index.js';
import { createHostToolDefinitions } from './src/runtime/tool-registry.js';
import { DEFAULT_AMK_CONFIG, DEFAULT_PLUGIN_ID, getDefaultStorageRoot } from './src/config.js';

const registeredApis = new WeakSet();

function resolvePluginConfig(api) {
  const pluginConfig = api?.pluginConfig || {};
  const openclawDataRoot = pluginConfig.openclawDataRoot
    ? api.resolvePath(pluginConfig.openclawDataRoot)
    : undefined;
  const storageRoot = pluginConfig.storage?.root
    ? api.resolvePath(pluginConfig.storage.root)
    : openclawDataRoot
      ? getDefaultStorageRoot(openclawDataRoot)
      : undefined;

  return {
    ...pluginConfig,
    ...(openclawDataRoot ? { openclawDataRoot } : {}),
    storage: {
      ...(pluginConfig.storage || {}),
      ...(storageRoot ? { root: storageRoot } : {}),
    },
  };
}

function buildMemoryPromptSection({ availableTools }) {
  const lines = [];
  const hasPrepare = availableTools.has('amk_prepare_user_turn');
  const hasCommit = availableTools.has('amk_commit_assistant_turn');
  const hasProfileRead = availableTools.has('amk_read_profile_record');
  const hasNamespace = availableTools.has('amk_get_memory_namespace');

  if (!hasPrepare && !hasCommit && !hasProfileRead && !hasNamespace) {
    return lines;
  }

  lines.push('## AMK Scope Routing');
  lines.push('This workspace uses OpenClaw AMK as the active memory slot for phase-1 isolation.');

  if (hasPrepare) {
    lines.push('Before handling a user turn, prefer `amk_prepare_user_turn` to initialize the user scope, read `profile`/`prove`, return the current `memoryNamespace`, and append the user transcript entry.');
  }

  if (hasCommit) {
    lines.push('After generating the assistant reply, prefer `amk_commit_assistant_turn` so the reply stays in the same isolated transcript route.');
  }

  if (hasProfileRead) {
    lines.push('When the task depends on user-specific profile or prove data, read it from the AMK user scope instead of assuming shared workspace state.');
  }

  if (hasNamespace) {
    lines.push('Use `amk_get_memory_namespace` when upstream memory routing needs the stable namespace for the current user or session scope.');
  }

  lines.push('');
  return lines;
}

function stringifyPromptData(data, maxChars = 1200) {
  if (data === null || data === undefined) {
    return 'null';
  }

  const serialized = JSON.stringify(data, null, 2);
  if (serialized.length <= maxChars) {
    return serialized;
  }

  return `${serialized.slice(0, maxChars)}\n...`;
}

function buildScopedPromptContext({ scope, memoryNamespace, workspacePath, profile, prove }) {
  const lines = [
    '<amk-scope-context>',
    `当前 scopeType: ${scope.scopeType}`,
    `当前 memoryNamespace: ${memoryNamespace || scope.memoryNamespace}`,
    `当前 agent workspace 目录: ${workspacePath || '未提供'}`,
    `当前隔离文件目录: ${scope.fileRoot}`,
    `当前 profile 目录: ${scope.profileRoot}`,
    `当前 transcript 目录: ${scope.transcriptRoot}`,
    '工作规则：',
    '1. 当用户要求列出工作区、找文件、读文件、写文件时，可访问当前 agent workspace 目录，以及当前用户隔离文件目录。',
    '2. 当用户发送文件、接收文件、落盘文件时，必须转存到当前隔离文件目录。',
    '3. 如果请求涉及其他用户文件、当前允许根目录之外的路径、或宿主全局工作区，必须明确拒绝。',
    '4. 如果请求涉及用户身份、年龄、病史、诊断、证明材料等，优先依据当前用户 scope 下的 profile/prove 记录回答。',
    '5. 不要把其他用户、其他群聊、其他 session 的资料混入当前对话。',
  ];

  if (scope.scopeType === 'user') {
    lines.push('当前用户 profile：');
    lines.push('```json');
    lines.push(stringifyPromptData(profile));
    lines.push('```');
    lines.push('当前用户 prove：');
    lines.push('```json');
    lines.push(stringifyPromptData(prove));
    lines.push('```');
  }

  lines.push('</amk-scope-context>');
  return lines.join('\n');
}

const INBOUND_METADATA_SENTINELS = [
  'Conversation info (untrusted metadata):',
  'Sender (untrusted metadata):',
  'Thread starter (untrusted, for context):',
  'Replied message (untrusted, for context):',
  'Forwarded message context (untrusted metadata):',
  'Chat history since last reply (untrusted, for context):',
];

const HOST_INBOUND_MEDIA_SEGMENT = `${path.sep}.openclaw${path.sep}media${path.sep}inbound${path.sep}`;

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collapseTextContent(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => collapseTextContent(item))
      .filter(Boolean)
      .join('\n');
  }

  if (typeof content?.text === 'string') {
    return content.text;
  }

  if (typeof content?.content === 'string' || Array.isArray(content?.content)) {
    return collapseTextContent(content.content);
  }

  return '';
}

function stripOpenClawMetadata(text) {
  if (!text) {
    return '';
  }

  let normalized = String(text).replace(/^System:\s*\[[^\n]+\].*$/gm, '');

  for (const sentinel of INBOUND_METADATA_SENTINELS) {
    const blockPattern = new RegExp(`${escapeRegex(sentinel)}\\s*\\n\`\`\`(?:json)?[\\s\\S]*?\`\`\``, 'g');
    normalized = normalized.replace(blockPattern, '');
  }

  normalized = normalized.replace(/^(User|Assistant):\s*/i, '');
  normalized = normalized.replace(/\n{3,}/g, '\n\n');
  return normalized.trim();
}

function normalizeToolNameForGuards(toolName) {
  return String(toolName || '').trim().toLowerCase();
}

function buildInboundMediaRecord(originalPath, scopeRelativePath) {
  return `[media attached: ${scopeRelativePath} | ${path.basename(originalPath)}]`;
}

function sanitizeInboundMediaMarkers(text, stagedMedia = []) {
  if (!text) {
    return '';
  }

  let normalized = String(text);
  for (const media of stagedMedia) {
    const exactMarker = `[media attached: ${media.originalPath} | ${media.originalPath}]`;
    normalized = normalized.split(exactMarker).join(buildInboundMediaRecord(media.originalPath, media.scopeRelativePath));
    normalized = normalized.split(media.originalPath).join(media.scopeRelativePath);
  }

  return normalized;
}

function extractInboundMediaPaths(text) {
  if (!text) {
    return [];
  }

  const matches = String(text).match(/[^\s|\]]*\.openclaw\/media\/inbound\/[^\s|\]]+/g) || [];
  return [...new Set(matches)];
}

async function stageInboundMediaIntoScope(core, context, text) {
  const inboundPaths = extractInboundMediaPaths(text);
  if (inboundPaths.length === 0) {
    return [];
  }

  const scope = await core.ensureScopeStorage(context);
  const stagedMedia = [];

  for (const inboundPath of inboundPaths) {
    const sourcePath = path.resolve(inboundPath);
    if (!sourcePath.includes(HOST_INBOUND_MEDIA_SEGMENT)) {
      continue;
    }

    const filename = path.basename(sourcePath);
    const scopeRelativePath = path.posix.join('inbound', filename);
    const targetPath = path.join(scope.fileRoot, scopeRelativePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.copyFile(sourcePath, targetPath);
    stagedMedia.push({
      originalPath: inboundPath,
      stagedPath: targetPath,
      scopeRelativePath,
    });
  }

  return stagedMedia;
}

function extractDirectSessionUserId(sessionKey) {
  if (!sessionKey || typeof sessionKey !== 'string') {
    return '';
  }

  const parts = sessionKey.split(':');
  const directIndex = parts.lastIndexOf('direct');
  if (directIndex === -1) {
    return '';
  }

  return parts[directIndex + 1] || '';
}

function inferPlatform(context = {}, text = '') {
  if (context.platform) {
    return String(context.platform);
  }

  if (context.channelId) {
    return String(context.channelId);
  }

  if (/\bFeishu\[/i.test(text) || context.feishuUserId) {
    return 'feishu';
  }

  return null;
}

function extractFeishuUserIdFromText(text) {
  if (!text) {
    return '';
  }

  const headerMatch = String(text).match(/Feishu\[.*?\]\s+(?:DM|Group)\s+\|\s+([^\s\[]+)/i);
  return headerMatch?.[1] || '';
}

function normalizeHookContext(event = {}, runtimeContext = {}) {
  const sessionKey = runtimeContext.sessionKey || event.sessionKey || null;
  const rawText = collapseTextContent(event.prompt || event.content || event.message?.content || '');
  const platform = inferPlatform({ ...event, ...runtimeContext }, rawText);
  const directSessionUserId = extractDirectSessionUserId(sessionKey);
  const feishuUserId = runtimeContext.feishuUserId
    || event.feishuUserId
    || (platform === 'feishu' ? directSessionUserId || extractFeishuUserIdFromText(rawText) : '');
  const userId = runtimeContext.userId || event.userId || (!feishuUserId ? directSessionUserId : '');

  return {
    platform,
    feishuUserId: feishuUserId || null,
    userId: userId || null,
    sessionId: runtimeContext.sessionId || event.sessionId || null,
    chatId: runtimeContext.chatId || runtimeContext.conversationId || event.chatId || event.conversationId || null,
    groupId: runtimeContext.groupId || event.groupId || null,
    channelId: runtimeContext.channelId || event.channelId || null,
    agentId: runtimeContext.agentId || event.agentId || null,
    workspacePath: runtimeContext.workspacePath || event.workspacePath || null,
  };
}

function canRouteContext(context, isolationMode) {
  if (isolationMode === 'user') {
    return Boolean(context.feishuUserId || context.userId);
  }

  return Boolean(context.sessionId || context.chatId || context.groupId || context.channelId);
}

function extractUserPrompt(event = {}) {
  const text = stripOpenClawMetadata(collapseTextContent(event.prompt || event.content || event.message?.content || ''));
  if (text) {
    return text;
  }

  if (Array.isArray(event.messages)) {
    for (let index = event.messages.length - 1; index >= 0; index -= 1) {
      const message = event.messages[index];
      if (message?.role !== 'user') {
        continue;
      }

      const content = stripOpenClawMetadata(collapseTextContent(message.content));
      if (content) {
        return content;
      }
    }
  }

  return '';
}

function extractAssistantReply(event = {}) {
  if (!Array.isArray(event.messages)) {
    return '';
  }

  for (let index = event.messages.length - 1; index >= 0; index -= 1) {
    const message = event.messages[index];
    if (message?.role !== 'assistant') {
      continue;
    }

    const content = stripOpenClawMetadata(collapseTextContent(message.content));
    if (content) {
      return content;
    }
  }

  return '';
}

const FILE_TOOL_NAMES = new Set([
  'read',
  'write',
  'edit',
  'glob',
  'grep',
  'ls',
  'list',
  'notebookedit',
]);

function normalizeToolName(event = {}) {
  return normalizeToolNameForGuards(
    event.toolName
      || event.name
      || event.tool?.name
      || event.call?.name
      || event.meta?.toolName
      || '',
  );
}

function extractToolInput(event = {}) {
  return event.input || event.args || event.parameters || event.payload || event.toolInput || {};
}

function collectPathCandidates(input) {
  if (!input || typeof input !== 'object') {
    return [];
  }

  const candidates = [];
  for (const key of [
    'file_path',
    'filePath',
    'path',
    'notebook_path',
    'notebookPath',
  ]) {
    if (typeof input[key] === 'string' && input[key].trim()) {
      candidates.push(input[key].trim());
    }
  }

  if (typeof input.path === 'string' && input.path.trim()) {
    candidates.push(input.path.trim());
  }

  if (typeof input.command === 'string' && input.command.trim()) {
    candidates.push(...extractPathLikeTokens(input.command));
  }

  return [...new Set(candidates)];
}

function extractPathLikeTokens(command) {
  if (!command || typeof command !== 'string') {
    return [];
  }

  const tokens = command.match(/(?:~|\.\.?|\/)[^\s"'`;|&)><]+/g) || [];
  return [...new Set(tokens.map((token) => token.trim()).filter(Boolean))];
}

function isInsideRoot(candidatePath, rootPath) {
  const resolved = path.resolve(candidatePath);
  const relativePath = path.relative(rootPath, resolved);
  return !(relativePath.startsWith('..') || path.isAbsolute(relativePath));
}

function isAllowedToolPath(candidatePath, allowedRoots, scope, context) {
  const resolved = path.resolve(candidatePath);
  const isInsideAllowedRoot = allowedRoots.some((allowedRoot) => isInsideRoot(resolved, allowedRoot));
  if (!isInsideAllowedRoot) {
    return false;
  }

  if (scope.scopeType !== 'user' || !context.workspacePath) {
    return true;
  }

  const workspaceUsersRoot = path.join(path.resolve(context.workspacePath), 'users');
  if (!isInsideRoot(resolved, workspaceUsersRoot)) {
    return true;
  }

  return isInsideRoot(resolved, path.resolve(scope.fileRoot));
}

function buildToolBlockResult(message) {
  return {
    block: true,
    message,
    error: message,
  };
}

function registerToolGuards(api, core) {
  if (typeof api.on !== 'function') {
    return;
  }

  api.on('before_tool_call', async (event = {}, runtimeContext = {}) => {
    const context = normalizeHookContext(event, runtimeContext);
    if (!canRouteContext(context, core.config.isolationMode)) {
      return;
    }

    const toolName = normalizeToolName(event);
    if (!toolName || !FILE_TOOL_NAMES.has(toolName)) {
      return;
    }

    const scope = core.resolveScope(context);
    const allowedRoots = [
      path.resolve(scope.fileRoot),
      ...(context.workspacePath ? [path.resolve(context.workspacePath)] : []),
    ];
    const input = extractToolInput(event);
    const candidates = collectPathCandidates(input);

    if (candidates.length === 0) {
      return;
    }

    for (const candidatePath of candidates) {
      if (!isAllowedToolPath(candidatePath, allowedRoots, scope, context)) {
        return buildToolBlockResult(`AMK 仅允许访问当前 agent workspace 或当前用户隔离目录：${allowedRoots.join(' , ')}`);
      }
    }
  });
}

function registerPromptHooks(api, core) {
  if (typeof api.on !== 'function') {
    return;
  }

  api.on('before_prompt_build', async (event = {}, runtimeContext = {}) => {
    const context = normalizeHookContext(event, runtimeContext);
    if (!canRouteContext(context, core.config.isolationMode)) {
      return;
    }

    const rawPrompt = collapseTextContent(event.prompt || event.content || event.message?.content || '');
    const stagedMedia = await stageInboundMediaIntoScope(core, context, rawPrompt);
    const sanitizedPrompt = sanitizeInboundMediaMarkers(rawPrompt, stagedMedia);

    if (core.config.isolationMode === 'user') {
      const initializedScope = await core.initUserScope(context);
      return {
        prompt: sanitizedPrompt || event.prompt,
        prependContext: buildScopedPromptContext({
          scope: initializedScope.scope,
          memoryNamespace: initializedScope.memoryNamespace,
          workspacePath: context.workspacePath,
          profile: initializedScope.profile?.data ?? null,
          prove: initializedScope.prove?.data ?? null,
        }),
      };
    }

    const scope = core.resolveScope(context);
    await core.ensureScopeStorage(scope);
    return {
      prompt: sanitizedPrompt || event.prompt,
      prependContext: buildScopedPromptContext({
        scope,
        memoryNamespace: scope.memoryNamespace,
        workspacePath: context.workspacePath,
        profile: null,
        prove: null,
      }),
    };
  });
}

function registerLifecycleHooks(api, core) {
  if (typeof api.on !== 'function') {
    return;
  }

  api.on('message_received', async (event = {}, runtimeContext = {}) => {
    const context = normalizeHookContext(event, runtimeContext);
    if (!canRouteContext(context, core.config.isolationMode)) {
      return;
    }

    const rawContent = collapseTextContent(event.content || event.prompt || event.message?.content || '');
    if (!rawContent) {
      return;
    }

    const stagedMedia = await stageInboundMediaIntoScope(core, context, rawContent);
    if (stagedMedia.length === 0) {
      return;
    }

    return {
      content: sanitizeInboundMediaMarkers(rawContent, stagedMedia),
    };
  });

  const userTurnEventName = 'before_agent_start';

  api.on(userTurnEventName, async (event = {}, runtimeContext = {}) => {
    const context = normalizeHookContext(event, runtimeContext);
    if (!canRouteContext(context, core.config.isolationMode)) {
      api.logger?.debug?.('openclaw-amk: skip prepareUserTurn because runtime context is missing scope identity');
      return;
    }

    const content = extractUserPrompt(event);
    if (!content) {
      return;
    }

    await core.prepareUserTurn(context, {
      content,
    });
  });

  api.on('agent_end', async (event = {}, runtimeContext = {}) => {
    if (!event?.success) {
      return;
    }

    const context = normalizeHookContext(event, runtimeContext);
    if (!canRouteContext(context, core.config.isolationMode)) {
      api.logger?.debug?.('openclaw-amk: skip commitAssistantTurn because runtime context is missing scope identity');
      return;
    }

    const content = extractAssistantReply(event);
    if (!content) {
      return;
    }

    await core.commitAssistantTurn(context, {
      content,
    });
  });
}

function registerTools(api, core) {
  for (const tool of createHostToolDefinitions(core)) {
    api.registerTool(
      (runtimeContext = {}) => ({
        description: tool.description,
        inputSchema: tool.inputSchema,
        async execute(input = {}) {
          if (tool.name === 'amk_resolve_scope') {
            return tool.execute(input.context || input || runtimeContext);
          }

          return tool.execute({
            ...input,
            context: input?.context || runtimeContext,
          });
        },
      }),
      {
        name: tool.name,
        description: tool.description,
      },
    );
  }
}

const openClawAmkPlugin = {
  id: DEFAULT_PLUGIN_ID,
  name: 'OpenClaw AMK',
  description: 'Phase-1 isolation plugin for scoped files, transcript storage, and memory namespace routing',
  kind: 'memory',
  register(api) {
    if (registeredApis.has(api)) {
      api.logger?.debug?.('openclaw-amk: register() called again, skipping duplicate registration');
      return;
    }
    registeredApis.add(api);

    const runtimeConfig = resolvePluginConfig(api);
    const core = createAmkPlugin(runtimeConfig);

    api.registerMemoryCapability?.({
      promptBuilder: buildMemoryPromptSection,
    });

    api.registerMemoryRuntime?.({
      async getMemorySearchManager() {
        return {
          manager: {
            status: () => ({
              backend: 'builtin',
              provider: DEFAULT_PLUGIN_ID,
              embeddingAvailable: false,
              retrievalAvailable: false,
            }),
            probeEmbeddingAvailability: async () => ({
              ok: false,
              error: 'OpenClaw AMK provides routing isolation only in phase-1',
            }),
            probeVectorAvailability: async () => false,
          },
        };
      },
      resolveMemoryBackendConfig() {
        return {
          backend: 'builtin',
        };
      },
    });

    registerTools(api, core);
    registerToolGuards(api, core);
    registerPromptHooks(api, core);
    registerLifecycleHooks(api, core);

    api.logger?.info?.(
      `openclaw-amk registered with isolationMode=${core.config.isolationMode} workspaceLocal=${core.config.sessionStorage.preferWorkspaceLocal}`,
    );
  },
};

export const pluginDefaults = DEFAULT_AMK_CONFIG;
export default openClawAmkPlugin;
