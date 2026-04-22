import { createAmkPlugin } from '../index.js';

const plugin = createAmkPlugin({
  isolationMode: 'user',
  storage: {
    root: './.openclaw-data',
  },
});

const context = {
  platform: 'feishu',
  feishuUserId: 'ou_demo_user_001',
  chatId: 'chat-demo-001',
  workspacePath: './workspace-demo',
  agentId: 'doctor-agent',
  channelId: 'feishu',
};

await plugin.writeScopeFile(context, {
  path: 'uploads/hello.txt',
  content: 'hello openclaw amk',
});

await plugin.writeProfileRecord(context, {
  recordType: 'profile',
  data: {
    patientName: '刘姐',
    condition: '高血压',
  },
});

await plugin.writeProfileRecord(context, {
  recordType: 'prove',
  data: {
    consentSigned: true,
    source: 'feishu-intake',
  },
});

const files = await plugin.listScopeFiles(context, { path: 'uploads' });
const profile = await plugin.readProfileRecord(context, { recordType: 'profile' });
const prove = await plugin.readProfileRecord(context, { recordType: 'prove' });
const transcriptWrite = await plugin.appendTranscriptEntry(context, {
  role: 'user',
  content: '你好，我来复诊。',
});
const transcript = await plugin.readTranscript(context);

console.log({
  namespace: plugin.getMemoryNamespace(context),
  files,
  profile,
  prove,
  transcriptWrite,
  transcript,
});
