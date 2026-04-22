import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createAmkPlugin } from '../src/index.js';

const runRoot = mkdtempSync(path.join(os.tmpdir(), 'openclaw-amk-core-'));

try {
  const storageRoot = path.join(runRoot, 'storage-root');
  const plugin = createAmkPlugin({
    enabled: true,
    isolationMode: 'session',
    storage: { root: storageRoot },
    sessionStorage: { preferWorkspaceLocal: true },
    transcript: { enabled: true },
    memory: { enabled: true },
  });

  const sessionContext = {
    sessionId: 'session-alpha',
    workspacePath: path.join(runRoot, 'workspace-a'),
    agentId: 'agent-main',
    channelId: 'telegram',
  };

  const fallbackContext = {
    chatId: 'chat-fallback',
    agentId: 'agent-main',
  };

  const scope = plugin.resolveScope(sessionContext);
  assert.equal(scope.scopeType, 'session');
  assert.equal(scope.routingSource, 'sessionId');
  assert.match(
    scope.scopePath,
    new RegExp(`\\${path.sep}\\.openclaw-amk\\${path.sep}sessions\\${path.sep}${scope.scopeHash}$`),
    'session mode should prefer workspace-local path when workspacePath is provided',
  );
  assert.equal(plugin.getMemoryNamespace(sessionContext), `session:${scope.scopeHash}`);

  const fallbackScope = plugin.resolveScope(fallbackContext);
  assert.equal(fallbackScope.routingSource, 'chatId');
  assert.equal(
    fallbackScope.scopePath,
    path.join(storageRoot, 'scopes', 'sessions', fallbackScope.scopeHash),
    'session mode should fall back to storage root when workspacePath is absent',
  );

  await plugin.writeScopeFile(sessionContext, {
    path: 'notes/hello.txt',
    content: 'hello session scope',
  });

  const file = await plugin.readScopeFile(sessionContext, {
    path: 'notes/hello.txt',
  });
  assert.equal(file.content, 'hello session scope');
  assert.equal(file.path, 'notes/hello.txt');

  const files = await plugin.listScopeFiles(sessionContext, {
    path: 'notes',
  });
  assert.deepEqual(files, [
    {
      name: 'hello.txt',
      path: 'notes/hello.txt',
      type: 'file',
    },
  ]);

  await assert.rejects(
    plugin.writeScopeFile(sessionContext, {
      path: '../escape.txt',
      content: 'nope',
    }),
    /Invalid resource path/,
  );

  await plugin.appendTranscriptEntry(sessionContext, {
    role: 'user',
    content: '你好',
  });
  await plugin.appendTranscriptEntry(sessionContext, {
    role: 'assistant',
    content: '你好，我在。',
    ts: '2026-04-10T00:00:00.000Z',
  });

  const transcript = await plugin.readTranscript(sessionContext);
  assert.equal(transcript.length, 2);
  assert.equal(transcript[0].role, 'user');
  assert.equal(transcript[0].content, '你好');
  assert.ok(transcript[0].ts, 'appendTranscriptEntry should backfill ts when omitted');
  assert.equal(transcript[1].ts, '2026-04-10T00:00:00.000Z');

  const emptyTranscript = await plugin.readTranscript({
    sessionId: 'session-empty',
    workspacePath: path.join(runRoot, 'workspace-empty'),
  });
  assert.deepEqual(emptyTranscript, []);

  const userPlugin = createAmkPlugin({
    enabled: true,
    isolationMode: 'user',
    storage: { root: path.join(runRoot, 'user-storage') },
  });
  const userContext = {
    platform: 'feishu',
    feishuUserId: 'ou_user_42',
    agentId: 'agent-med',
    workspacePath: path.join(runRoot, 'workspace-user'),
    chatId: 'chat-user-42-a',
  };
  const userScope = userPlugin.resolveScope(userContext);
  assert.equal(userScope.scopeType, 'user');
  assert.equal(userScope.routingSource, 'feishuUserId');
  assert.equal(
    userScope.scopePath,
    path.join(runRoot, 'user-storage', 'agents', 'agent-med', 'users', 'feishu', userScope.scopeHash),
    'user mode should store profile/memory/transcript metadata under agent-scoped user directory',
  );
  assert.equal(
    userScope.fileRoot,
    path.join(runRoot, 'workspace-user', 'users', 'feishu', userScope.scopeHash, 'files'),
    'user mode should place file storage inside the agent workspace when workspacePath is provided',
  );
  assert.equal(
    userPlugin.getMemoryNamespace(userContext),
    `user:feishu:agent-med:${userScope.scopeHash}`,
  );

  await userPlugin.writeProfileRecord(userContext, {
    recordType: 'profile',
    data: {
      name: '刘姐',
      condition: '高血压',
    },
  });
  await userPlugin.writeProfileRecord(userContext, {
    recordType: 'prove',
    data: {
      consent: true,
      updatedBy: 'agent-med',
    },
  });

  const userProfile = await userPlugin.readProfileRecord(userContext, {
    recordType: 'profile',
  });
  const userProve = await userPlugin.readProfileRecord(userContext, {
    recordType: 'prove',
  });
  const emptyProfile = await userPlugin.readProfileRecord(
    {
      ...userContext,
      feishuUserId: 'ou_user_99',
    },
    {
      recordType: 'profile',
    },
  );
  assert.deepEqual(userProfile.data, {
    name: '刘姐',
    condition: '高血压',
  });
  assert.deepEqual(userProve.data, {
    consent: true,
    updatedBy: 'agent-med',
  });
  assert.equal(emptyProfile.data, null, 'another user scope should not read profile data from this user');

  const initializedUser = await userPlugin.initUserScope({
    ...userContext,
    feishuUserId: 'ou_user_init',
    chatId: 'chat-user-init',
  });
  assert.equal(initializedUser.scope.scopeType, 'user', 'initUserScope should only operate on a user scope');
  assert.equal(initializedUser.profile.data, null, 'initUserScope should create empty profile placeholder when missing');
  assert.equal(initializedUser.prove.data, null, 'initUserScope should create empty prove placeholder when missing');
  assert.deepEqual(initializedUser.initialized, {
    profile: true,
    prove: true,
  });

  const preparedTurn = await userPlugin.prepareUserTurn({
    ...userContext,
    feishuUserId: 'ou_user_turn',
    chatId: 'chat-user-turn',
  }, {
    content: '我今天头晕，帮我看看。',
  });
  assert.equal(preparedTurn.profile.data, null, 'prepareUserTurn should initialize missing profile');
  assert.equal(preparedTurn.prove.data, null, 'prepareUserTurn should initialize missing prove');
  assert.equal(preparedTurn.memoryNamespace, preparedTurn.scope.memoryNamespace);
  const preparedTranscript = await userPlugin.readTranscript({
    ...userContext,
    feishuUserId: 'ou_user_turn',
    chatId: 'chat-user-turn',
  });
  assert.equal(preparedTranscript.length, 1, 'prepareUserTurn should append the incoming user message');
  assert.equal(preparedTranscript[0].role, 'user');
  assert.equal(preparedTranscript[0].content, '我今天头晕，帮我看看。');

  const committedTurn = await userPlugin.commitAssistantTurn({
    ...userContext,
    feishuUserId: 'ou_user_turn',
    chatId: 'chat-user-turn',
  }, {
    content: '先记录一下血压和近期症状。',
  });
  assert.equal(committedTurn.memoryNamespace, preparedTurn.memoryNamespace);
  const committedTranscript = await userPlugin.readTranscript({
    ...userContext,
    feishuUserId: 'ou_user_turn',
    chatId: 'chat-user-turn',
  });
  assert.equal(committedTranscript.length, 2, 'commitAssistantTurn should append the assistant reply');
  assert.equal(committedTranscript[1].role, 'assistant');
  assert.equal(committedTranscript[1].content, '先记录一下血压和近期症状。');

  await assert.rejects(
    plugin.initUserScope({
      sessionId: 'session-only',
      agentId: 'agent-med',
      workspacePath: path.join(runRoot, 'workspace-session-only'),
    }),
    /initUserScope requires a user scope/,
  );

  await userPlugin.appendTranscriptEntry(userContext, {
    role: 'user',
    content: '来自 chat a',
  });
  await userPlugin.appendTranscriptEntry(
    {
      ...userContext,
      chatId: 'chat-user-42-b',
    },
    {
      role: 'user',
      content: '来自 chat b',
    },
  );

  const userTranscriptA = await userPlugin.readTranscript(userContext);
  const userTranscriptB = await userPlugin.readTranscript({
    ...userContext,
    chatId: 'chat-user-42-b',
  });
  assert.equal(userTranscriptA.length, 1, 'user transcript should be routed by chat/session identity inside the same user scope');
  assert.equal(userTranscriptA[0].content, '来自 chat a');
  assert.equal(userTranscriptB.length, 1, 'another chat should get its own transcript file inside the same user scope');
  assert.equal(userTranscriptB[0].content, '来自 chat b');

  await assert.rejects(
    userPlugin.writeProfileRecord(userContext, {
      recordType: 'unknown',
      data: {},
    }),
    /recordType must be one of: profile, prove/,
  );

  assert.throws(
    () => userPlugin.resolveScope({ platform: 'feishu', agentId: 'agent-med' }),
    /feishuUserId is required when platform=feishu and isolationMode=user/,
  );
  assert.throws(
    () => plugin.resolveScope({}),
    /sessionId, chatId, groupId, or channelId is required when isolationMode=session/,
  );

  console.log('core scope behavior passed');
} finally {
  rmSync(runRoot, { recursive: true, force: true });
}
