import { createAmkPlugin } from '../index.js';

export function registerAmkPluginForOpenClaw(runtimeConfig = {}) {
  const plugin = createAmkPlugin(runtimeConfig);

  return {
    name: 'openclaw-amk',
    tools: plugin.createToolRegistry(),
    plugin,
  };
}

export async function exampleRuntimeCalls(runtimeConfig = {}) {
  const plugin = createAmkPlugin(runtimeConfig);
  const context = {
    platform: 'feishu',
    feishuUserId: 'ou_demo_user_001',
    chatId: 'chat-demo-001',
    workspacePath: './workspace-demo',
    agentId: 'doctor-agent',
    channelId: 'feishu',
  };

  await plugin.writeProfileRecord(context, {
    recordType: 'profile',
    data: {
      patientName: '王大哥',
      diagnosis: '糖尿病',
    },
  });

  await plugin.appendTranscriptEntry(context, {
    role: 'assistant',
    content: '您好，我已记录本次随访信息。',
  });

  return {
    namespace: plugin.getMemoryNamespace(context),
    profile: await plugin.readProfileRecord(context, { recordType: 'profile' }),
    transcript: await plugin.readTranscript(context),
  };
}
