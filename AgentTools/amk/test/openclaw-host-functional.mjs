import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import plugin from '../index.js';

function createMockApi(pluginConfig = {}) {
  return {
    pluginConfig,
    toolFactories: {},
    hooks: {},
    memoryCapability: null,
    logger: {
      info() {},
      warn() {},
      error() {},
      debug() {},
    },
    resolvePath(value) {
      return path.resolve(value);
    },
    registerTool(toolOrFactory, meta) {
      this.toolFactories[meta.name] =
        typeof toolOrFactory === 'function' ? toolOrFactory : () => toolOrFactory;
    },
    registerMemoryCapability(definition) {
      this.memoryCapability = definition;
    },
    on(name, handler) {
      this.hooks[name] = handler;
    },
  };
}

const runRoot = mkdtempSync(path.join(os.tmpdir(), 'openclaw-amk-host-'));

try {
  const api = createMockApi({
    enabled: true,
    isolationMode: 'session',
    openclawDataRoot: path.join(runRoot, 'data-root'),
    sessionStorage: {
      preferWorkspaceLocal: true,
    },
    transcript: {
      enabled: true,
    },
    memory: {
      enabled: true,
    },
  });

  plugin.register(api);

  const expectedTools = [
    'amk_resolve_scope',
    'amk_init_user_scope',
    'amk_prepare_user_turn',
    'amk_commit_assistant_turn',
    'amk_list_resources',
    'amk_read_resource',
    'amk_write_scope_file',
    'amk_write_profile_record',
    'amk_read_profile_record',
    'amk_append_transcript_entry',
    'amk_read_transcript',
    'amk_get_memory_namespace',
  ];

  assert.deepEqual(Object.keys(api.toolFactories).sort(), expectedTools.sort(), 'plugin should register all phase-1 tools');
  assert.equal(typeof api.memoryCapability?.promptBuilder, 'function', 'plugin should register a memory capability prompt builder');
  assert.equal(typeof api.hooks.before_agent_start, 'function', 'plugin should register before_agent_start hook');
  assert.equal(typeof api.hooks.agent_end, 'function', 'plugin should register agent_end hook');
  assert.equal(typeof api.hooks.message_received, 'function', 'plugin should register message_received hook');
  assert.equal(typeof api.hooks.before_tool_call, 'function', 'plugin should register before_tool_call guard hook');
  assert.equal(typeof api.hooks.before_prompt_build, 'function', 'plugin should register before_prompt_build hook');
  assert.ok(
    api.memoryCapability.promptBuilder({ availableTools: new Set(expectedTools) }).some((line) => line.includes('AMK Scope Routing')),
    'memory capability prompt builder should describe AMK scope routing',
  );

  const sessionContextA = {
    sessionId: 'session-a',
    workspacePath: path.join(runRoot, 'workspace-a'),
    agentId: 'agent-main',
    channelId: 'telegram',
  };
  const sessionContextB = {
    sessionId: 'session-b',
    workspacePath: path.join(runRoot, 'workspace-b'),
    agentId: 'agent-main',
    channelId: 'telegram',
  };

  const resolveScopeTool = api.toolFactories.amk_resolve_scope(sessionContextA);
  const writeTool = api.toolFactories.amk_write_scope_file(sessionContextA);
  const listToolA = api.toolFactories.amk_list_resources(sessionContextA);
  const listToolB = api.toolFactories.amk_list_resources(sessionContextB);
  const appendTranscriptTool = api.toolFactories.amk_append_transcript_entry(sessionContextA);
  const readTranscriptTool = api.toolFactories.amk_read_transcript(sessionContextA);
  const namespaceTool = api.toolFactories.amk_get_memory_namespace(sessionContextA);

  const scopeA = await resolveScopeTool.execute({ context: sessionContextA });
  const scopeB = await resolveScopeTool.execute({ context: sessionContextB });
  const sessionPromptContext = await api.hooks.before_prompt_build({
    prompt: '列出我工作区里的文件',
  }, sessionContextA);

  assert.match(sessionPromptContext?.prependContext || '', /当前隔离文件目录:/, 'session prompt hook should inject isolated workspace guidance');
  assert.match(sessionPromptContext?.prependContext || '', /当前 agent workspace 目录:/, 'session prompt hook should expose the current agent workspace root');
  assert.match(sessionPromptContext?.prependContext || '', new RegExp(scopeA.fileRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'session prompt hook should expose the current scoped file root');
  assert.match(sessionPromptContext?.prependContext || '', new RegExp(sessionContextA.workspacePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'session prompt hook should expose the current workspace root');
  assert.match(sessionPromptContext?.prependContext || '', /可访问当前 agent workspace 目录，以及当前用户隔离文件目录/, 'session prompt hook should describe the allowed roots');
  assert.doesNotMatch(sessionPromptContext?.prependContext || '', /当前用户 profile：/, 'session prompt hook should not inject profile data in session mode');

  const allowedShell = await api.hooks.before_tool_call({
    toolName: 'Bash',
    input: {
      command: 'pwd',
    },
  }, sessionContextA);
  assert.equal(allowedShell, undefined, 'guard hook should not block shell-like tools');

  const allowedLowercaseExecInside = await api.hooks.before_tool_call({
    toolName: 'exec',
    input: {
      command: `tar -xf ${path.join(scopeA.fileRoot, 'inbound', 'package.tgz')} -C ${path.join(scopeA.fileRoot, 'inbound')}`,
    },
  }, sessionContextA);
  assert.equal(allowedLowercaseExecInside, undefined, 'guard hook should not block lowercase exec tool names');

  const allowedLowercaseExecOutside = await api.hooks.before_tool_call({
    toolName: 'exec',
    input: {
      command: 'tar -xf /tmp/package.tgz -C /tmp/package',
    },
  }, sessionContextA);
  assert.equal(allowedLowercaseExecOutside, undefined, 'guard hook should not constrain exec path usage');

  const blockedReadOutside = await api.hooks.before_tool_call({
    toolName: 'Read',
    input: {
      file_path: path.join(runRoot, 'outside.txt'),
    },
  }, sessionContextA);
  assert.equal(blockedReadOutside?.block, true, 'guard hook should block file access outside allowed roots');

  const allowedReadInside = await api.hooks.before_tool_call({
    toolName: 'Read',
    input: {
      file_path: path.join(scopeA.fileRoot, 'uploads', 'hello.txt'),
    },
  }, sessionContextA);
  assert.equal(allowedReadInside, undefined, 'guard hook should allow file access inside isolated root');

  const allowedWorkspaceRead = await api.hooks.before_tool_call({
    toolName: 'Read',
    input: {
      file_path: path.join(sessionContextA.workspacePath, 'README.md'),
    },
  }, sessionContextA);
  assert.equal(allowedWorkspaceRead, undefined, 'guard hook should allow file access inside the current workspace root');

  const allowedLowercaseReadInside = await api.hooks.before_tool_call({
    toolName: 'read',
    input: {
      path: path.join(scopeA.fileRoot, 'uploads', 'hello.txt'),
    },
  }, sessionContextA);
  assert.equal(allowedLowercaseReadInside, undefined, 'guard hook should allow lowercase read inside isolated root');

  assert.notEqual(scopeA.scopeHash, scopeB.scopeHash, 'different sessions should resolve to different scope hashes');
  assert.match(
    scopeA.scopePath,
    new RegExp(`\\${path.sep}\\.openclaw-amk\\${path.sep}sessions\\${path.sep}${scopeA.scopeHash}$`),
    'session mode should prefer workspace-local storage when workspacePath is provided',
  );

  await writeTool.execute({
    context: sessionContextA,
    payload: {
      path: 'uploads/hello.txt',
      content: 'hello amk',
    },
  });

  const filesA = await listToolA.execute({
    context: sessionContextA,
    options: {
      path: 'uploads',
    },
  });
  const filesB = await listToolB.execute({
    context: sessionContextB,
    options: {
      path: 'uploads',
    },
  }).catch((error) => error);

  assert.equal(filesA.length, 1, 'written file should be visible inside the same session scope');
  assert.equal(filesA[0].name, 'hello.txt', 'written file should keep its relative name');
  assert.ok(filesB instanceof Error, 'other session should not see a directory that was never created in its scope');

  await appendTranscriptTool.execute({
    context: sessionContextA,
    entry: {
      role: 'user',
      content: 'session transcript hello',
    },
  });
  const sessionTranscript = await readTranscriptTool.execute({ context: sessionContextA });
  assert.equal(sessionTranscript.length, 1, 'session transcript tool should read appended messages');
  assert.equal(sessionTranscript[0].content, 'session transcript hello');

  const namespace = await namespaceTool.execute({ context: sessionContextA });
  assert.equal(namespace, `session:${scopeA.scopeHash}`, 'memory namespace should match resolved session scope');

  const userApi = createMockApi({
    enabled: true,
    isolationMode: 'user',
    openclawDataRoot: path.join(runRoot, 'data-root-user'),
  });
  plugin.register(userApi);

  const userContext = {
    platform: 'feishu',
    feishuUserId: 'ou_user_123',
    agentId: 'doctor-agent',
    workspacePath: path.join(runRoot, 'workspace-user'),
    chatId: 'chat-user-123',
  };
  const userResolveTool = userApi.toolFactories.amk_resolve_scope(userContext);
  const userInitScopeTool = userApi.toolFactories.amk_init_user_scope(userContext);
  const userPrepareTurnTool = userApi.toolFactories.amk_prepare_user_turn(userContext);
  const userCommitTurnTool = userApi.toolFactories.amk_commit_assistant_turn(userContext);
  const userNamespaceTool = userApi.toolFactories.amk_get_memory_namespace(userContext);
  const userWriteProfileTool = userApi.toolFactories.amk_write_profile_record(userContext);
  const userReadProfileTool = userApi.toolFactories.amk_read_profile_record(userContext);
  const userAppendTranscriptTool = userApi.toolFactories.amk_append_transcript_entry(userContext);
  const userReadTranscriptTool = userApi.toolFactories.amk_read_transcript(userContext);
  const userScope = await userResolveTool.execute({ context: userContext });
  const userNamespace = await userNamespaceTool.execute({ context: userContext });

  assert.equal(userScope.scopeType, 'user', 'user mode should resolve a user scope');
  assert.equal(userScope.routingSource, 'feishuUserId', 'feishu user routing should key by feishuUserId');
  assert.equal(
    userScope.scopePath,
    path.join(runRoot, 'data-root-user', 'plugins', 'openclaw-amk', 'agents', 'doctor-agent', 'users', 'feishu', userScope.scopeHash),
    'user mode should place scoped profile/memory/transcript data under the agent-scoped plugin directory',
  );
  assert.equal(
    userScope.fileRoot,
    path.join(runRoot, 'workspace-user', 'users', 'feishu', userScope.scopeHash, 'files'),
    'user mode should place file storage in the agent workspace',
  );
  assert.equal(userNamespace, `user:feishu:doctor-agent:${userScope.scopeHash}`, 'user mode should expose a stable user namespace');

  const initializedUser = await userInitScopeTool.execute({
    context: {
      ...userContext,
      feishuUserId: 'ou_user_init',
      chatId: 'chat-user-init',
    },
  });
  assert.equal(initializedUser.scope.scopeType, 'user', 'host init tool should resolve a user scope');
  assert.equal(initializedUser.profile.data, null, 'host init tool should create empty profile placeholder');
  assert.equal(initializedUser.prove.data, null, 'host init tool should create empty prove placeholder');

  const preparedTurn = await userPrepareTurnTool.execute({
    context: {
      ...userContext,
      feishuUserId: 'ou_user_turn',
      chatId: 'chat-user-turn',
    },
    message: {
      content: '最近有点胸闷。',
    },
  });
  assert.equal(preparedTurn.profile.data, null, 'host prepare tool should read initialized profile');
  assert.equal(preparedTurn.prove.data, null, 'host prepare tool should read initialized prove');
  assert.equal(preparedTurn.memoryNamespace, preparedTurn.scope.memoryNamespace);

  const committedTurn = await userCommitTurnTool.execute({
    context: {
      ...userContext,
      feishuUserId: 'ou_user_turn',
      chatId: 'chat-user-turn',
    },
    message: {
      content: '先补充最近三天血压记录。',
    },
  });
  assert.equal(committedTurn.memoryNamespace, preparedTurn.memoryNamespace, 'host commit tool should stay in the same user namespace');
  const preparedTranscript = await userReadTranscriptTool.execute({
    context: {
      ...userContext,
      feishuUserId: 'ou_user_turn',
      chatId: 'chat-user-turn',
    },
  });
  assert.equal(preparedTranscript.length, 2, 'host prepare/commit tools should append both transcript entries');
  assert.equal(preparedTranscript[0].role, 'user');
  assert.equal(preparedTranscript[1].role, 'assistant');

  await userWriteProfileTool.execute({
    context: userContext,
    payload: {
      recordType: 'profile',
      data: {
        patientName: '王大哥',
        diagnosis: '糖尿病',
      },
    },
  });
  const userProfile = await userReadProfileTool.execute({
    context: userContext,
    resourceRef: {
      recordType: 'profile',
    },
  });
  assert.deepEqual(userProfile.data, {
    patientName: '王大哥',
    diagnosis: '糖尿病',
  }, 'host tools should read back the user-scoped profile record');

  const userPromptContext = await userApi.hooks.before_prompt_build({
    prompt: '我是谁，我的资料是什么？',
  }, userContext);
  assert.match(userPromptContext?.prependContext || '', /当前用户 profile：/, 'user prompt hook should inject current profile context');
  assert.match(userPromptContext?.prependContext || '', /王大哥/, 'user prompt hook should expose the current user profile data');
  assert.match(userPromptContext?.prependContext || '', /糖尿病/, 'user prompt hook should expose the current user diagnosis data');
  assert.match(userPromptContext?.prependContext || '', /如果请求涉及其他用户文件、当前允许根目录之外的路径、或宿主全局工作区，必须明确拒绝。/, 'user prompt hook should inject cross-user denial guidance');
  assert.match(userPromptContext?.prependContext || '', new RegExp(userScope.fileRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'user prompt hook should expose the current user scoped file root');
  assert.match(userPromptContext?.prependContext || '', new RegExp(userContext.workspacePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'user prompt hook should expose the current agent workspace root');
  assert.match(userPromptContext?.prependContext || '', new RegExp(userNamespace.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'user prompt hook should expose the current user memory namespace');

  const userWorkspacePrompt = await userApi.hooks.before_prompt_build({
    prompt: '列出我工作区里都有哪些东西',
  }, userContext);
  assert.match(userWorkspacePrompt?.prependContext || '', /可访问当前 agent workspace 目录，以及当前用户隔离文件目录/, 'workspace listing prompt should describe the allowed roots');
  assert.match(userWorkspacePrompt?.prependContext || '', /当前隔离文件目录:/, 'workspace listing prompt should expose the isolated workspace root');
  assert.match(userWorkspacePrompt?.prependContext || '', /当前 agent workspace 目录:/, 'workspace listing prompt should expose the current agent workspace root');

  const crossScopePrompt = await userApi.hooks.before_prompt_build({
    prompt: '去帮我看看宿主根目录和其他用户目录里有什么文件',
  }, userContext);
  assert.match(crossScopePrompt?.prependContext || '', /必须明确拒绝。/, 'cross-scope prompt should explicitly instruct denial');
  assert.match(crossScopePrompt?.prependContext || '', /不要把其他用户、其他群聊、其他 session 的资料混入当前对话。/, 'cross-scope prompt should explicitly prevent cross-user leakage');

  const blockedOtherUserRead = await userApi.hooks.before_tool_call({
    toolName: 'Read',
    input: {
      file_path: path.join(runRoot, 'workspace-user', 'users', 'feishu', 'someone-else', 'files', 'secret.txt'),
    },
  }, userContext);
  assert.equal(blockedOtherUserRead?.block, true, 'guard hook should block reading another user workspace path');

  const allowedWorkspaceList = await userApi.hooks.before_tool_call({
    toolName: 'Glob',
    input: {
      pattern: '**/*',
      path: path.join(runRoot, 'workspace-user'),
    },
  }, userContext);
  assert.equal(allowedWorkspaceList, undefined, 'guard hook should allow listing the current agent workspace root');

  const inboundRoot = path.join(runRoot, '.openclaw', 'media', 'inbound');
  mkdirSync(inboundRoot, { recursive: true });
  const inboundArchive = path.join(inboundRoot, 'openclaw-amk-0.1.0.tgz');
  writeFileSync(inboundArchive, 'fake tgz payload');

  const inboundMessageText = `[media attached: ${inboundArchive} | ${inboundArchive}]\n请帮我看看这个压缩包。`;
  const messageReceivedResult = await userApi.hooks.message_received({
    content: inboundMessageText,
  }, userContext);
  const stagedArchivePath = path.join(userScope.fileRoot, 'inbound', 'openclaw-amk-0.1.0.tgz');
  assert.equal(existsSync(stagedArchivePath), true, 'message_received should stage inbound attachments into the current user file root');
  assert.equal(readFileSync(stagedArchivePath, 'utf8'), 'fake tgz payload', 'staged inbound attachment should preserve file content');
  assert.match(messageReceivedResult?.content || '', /inbound\/openclaw-amk-0.1.0.tgz/, 'message_received should rewrite inbound media path to scoped relative path');
  assert.doesNotMatch(messageReceivedResult?.content || '', /\.openclaw\/media\/inbound/, 'message_received should hide host inbound media paths from the model');

  const attachmentPromptContext = await userApi.hooks.before_prompt_build({
    prompt: inboundMessageText,
  }, userContext);
  assert.match(attachmentPromptContext?.prompt || '', /inbound\/openclaw-amk-0.1.0.tgz/, 'before_prompt_build should expose only the scoped attachment path');
  assert.doesNotMatch(attachmentPromptContext?.prompt || '', /\.openclaw\/media\/inbound/, 'before_prompt_build should not expose host inbound media path');

  const blockedLowercaseReadOutside = await userApi.hooks.before_tool_call({
    toolName: 'read',
    input: {
      path: '/tmp/package/README.md',
    },
  }, userContext);
  assert.equal(blockedLowercaseReadOutside?.block, true, 'guard hook should block lowercase read paths outside the current user scope');

  const userContextB = {
    platform: 'feishu',
    feishuUserId: 'ou_user_456',
    agentId: 'doctor-agent',
    workspacePath: path.join(runRoot, 'workspace-user-b'),
    chatId: 'chat-user-456',
  };
  const userWriteProfileToolB = userApi.toolFactories.amk_write_profile_record(userContextB);
  await userWriteProfileToolB.execute({
    context: userContextB,
    payload: {
      recordType: 'profile',
      data: {
        patientName: '刘姐',
        diagnosis: '高血压',
      },
    },
  });

  const userPromptContextB = await userApi.hooks.before_prompt_build({
    prompt: '我是谁，我的资料是什么？',
  }, userContextB);
  assert.match(userPromptContextB?.prependContext || '', /刘姐/, 'second user prompt should expose its own profile data');
  assert.match(userPromptContextB?.prependContext || '', /高血压/, 'second user prompt should expose its own diagnosis data');
  assert.doesNotMatch(userPromptContextB?.prependContext || '', /王大哥/, 'second user prompt should not leak first user profile data');
  assert.doesNotMatch(userPromptContextB?.prependContext || '', /糖尿病/, 'second user prompt should not leak first user diagnosis data');

  const userPromptContextAAgain = await userApi.hooks.before_prompt_build({
    prompt: '再次确认我是谁',
  }, userContext);
  assert.match(userPromptContextAAgain?.prependContext || '', /王大哥/, 'first user prompt should still expose its own profile data');
  assert.match(userPromptContextAAgain?.prependContext || '', /糖尿病/, 'first user prompt should still expose its own diagnosis data');
  assert.doesNotMatch(userPromptContextAAgain?.prependContext || '', /刘姐/, 'first user prompt should not leak second user profile data');
  assert.doesNotMatch(userPromptContextAAgain?.prependContext || '', /高血压/, 'first user prompt should not leak second user diagnosis data');

  await userAppendTranscriptTool.execute({
    context: userContext,
    entry: {
      role: 'assistant',
      content: '您好，这里是当前聊天记录。',
    },
  });
  const userTranscript = await userReadTranscriptTool.execute({ context: userContext });
  assert.equal(userTranscript.length, 1, 'user transcript tool should read transcript entries in current chat scope');
  assert.equal(userTranscript[0].content, '您好，这里是当前聊天记录。');

  const autoHookContext = {
    agentId: 'doctor-agent',
    workspacePath: path.join(runRoot, 'workspace-auto-user'),
    channelId: 'feishu',
    sessionKey: 'agent:main:feishu:direct:ou_auto_user_001',
    conversationId: 'chat-auto-user-001',
  };
  await userApi.hooks.before_agent_start({
    prompt: [
      'System: [2026-04-13 09:00:00 GMT+8] Feishu[default] DM | ou_auto_user_001 [msg:om_001]',
      '',
      'Sender (untrusted metadata):',
      '```json',
      '{"id":"ou_auto_user_001","name":"测试用户"}',
      '```',
      '',
      '用户：我刚加好友，帮我建档。',
    ].join('\n'),
  }, autoHookContext);
  await userApi.hooks.agent_end({
    success: true,
    messages: [
      { role: 'user', content: '用户：我刚加好友，帮我建档。' },
      { role: 'assistant', content: '好的，已为你初始化档案。' },
    ],
  }, autoHookContext);

  const autoTranscript = await userReadTranscriptTool.execute({
    context: {
      platform: 'feishu',
      feishuUserId: 'ou_auto_user_001',
      agentId: 'doctor-agent',
      workspacePath: path.join(runRoot, 'workspace-auto-user'),
      chatId: 'chat-auto-user-001',
      channelId: 'feishu',
    },
  });
  assert.equal(autoTranscript.length, 2, 'runtime hooks should append user and assistant transcript entries');
  assert.equal(autoTranscript[0].content, '用户：我刚加好友，帮我建档。');
  assert.equal(autoTranscript[1].content, '好的，已为你初始化档案。');

  const autoScope = await userResolveTool.execute({
    context: {
      platform: 'feishu',
      feishuUserId: 'ou_auto_user_001',
      agentId: 'doctor-agent',
      workspacePath: path.join(runRoot, 'workspace-auto-user'),
      chatId: 'chat-auto-user-001',
      channelId: 'feishu',
    },
  });
  const autoPrepared = await userInitScopeTool.execute({
    context: {
      platform: 'feishu',
      feishuUserId: 'ou_auto_user_001',
      agentId: 'doctor-agent',
      workspacePath: path.join(runRoot, 'workspace-auto-user'),
      chatId: 'chat-auto-user-001',
      channelId: 'feishu',
    },
  });
  assert.equal(autoScope.scopeType, 'user', 'runtime hooks should resolve a user scope from hook context');
  assert.equal(autoPrepared.profile.data, null, 'runtime hooks should initialize empty profile records for new users');
  assert.equal(autoPrepared.prove.data, null, 'runtime hooks should initialize empty prove records for new users');

  plugin.register(api);
  assert.deepEqual(Object.keys(api.toolFactories).sort(), expectedTools.sort(), 're-registering the same api should remain idempotent');

  console.log('openclaw host functional smoke passed');
} finally {
  rmSync(runRoot, { recursive: true, force: true });
}
