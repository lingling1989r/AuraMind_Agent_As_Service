function createObjectSchema(properties, required = []) {
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    required,
  };
}

const contextSchema = createObjectSchema({
  platform: { type: 'string' },
  userId: { type: 'string' },
  feishuUserId: { type: 'string' },
  sessionId: { type: 'string' },
  chatId: { type: 'string' },
  groupId: { type: 'string' },
  channelId: { type: 'string' },
  agentId: { type: 'string' },
  workspacePath: { type: 'string' },
});

function createToolDefinitions(core) {
  return [
    {
      name: 'amk_resolve_scope',
      description: 'Resolve the active AMK isolation scope from the current runtime context.',
      inputSchema: contextSchema,
      execute: async (input) => core.resolveScope(input),
    },
    {
      name: 'amk_init_user_scope',
      description: 'Initialize the current user scope and ensure profile/prove placeholders exist.',
      inputSchema: createObjectSchema(
        {
          context: contextSchema,
          payload: createObjectSchema({
            profile: {},
            prove: {},
          }),
        },
        ['context'],
      ),
      execute: async (input) => core.initUserScope(input.context, input.payload),
    },
    {
      name: 'amk_prepare_user_turn',
      description: 'Prepare the current user turn by ensuring scope, reading profile/prove, and appending the user transcript entry.',
      inputSchema: createObjectSchema(
        {
          context: contextSchema,
          message: createObjectSchema({
            content: { type: 'string' },
            ts: { type: 'string' },
          }, ['content']),
        },
        ['context', 'message'],
      ),
      execute: async (input) => core.prepareUserTurn(input.context, input.message),
    },
    {
      name: 'amk_commit_assistant_turn',
      description: 'Commit the assistant reply into the current user transcript.',
      inputSchema: createObjectSchema(
        {
          context: contextSchema,
          message: createObjectSchema({
            content: { type: 'string' },
            ts: { type: 'string' },
          }, ['content']),
        },
        ['context', 'message'],
      ),
      execute: async (input) => core.commitAssistantTurn(input.context, input.message),
    },
    {
      name: 'amk_list_resources',
      description: 'List files available inside the current AMK scope.',
      inputSchema: createObjectSchema(
        {
          context: contextSchema,
          options: createObjectSchema({
            path: { type: 'string' },
          }),
        },
        ['context'],
      ),
      execute: async (input) => core.listScopeFiles(input.context, input.options),
    },
    {
      name: 'amk_read_resource',
      description: 'Read a file from the current AMK scope.',
      inputSchema: createObjectSchema(
        {
          context: contextSchema,
          resourceRef: createObjectSchema(
            {
              path: { type: 'string' },
              encoding: { type: 'string' },
            },
            ['path'],
          ),
        },
        ['context', 'resourceRef'],
      ),
      execute: async (input) => core.readScopeFile(input.context, input.resourceRef),
    },
    {
      name: 'amk_write_scope_file',
      description: 'Write a file into the current AMK scope.',
      inputSchema: createObjectSchema(
        {
          context: contextSchema,
          payload: createObjectSchema(
            {
              path: { type: 'string' },
              content: { type: 'string' },
              encoding: { type: 'string' },
            },
            ['path', 'content'],
          ),
        },
        ['context', 'payload'],
      ),
      execute: async (input) => core.writeScopeFile(input.context, input.payload),
    },
    {
      name: 'amk_write_profile_record',
      description: 'Write a profile or prove record into the current AMK user scope.',
      inputSchema: createObjectSchema(
        {
          context: contextSchema,
          payload: createObjectSchema(
            {
              recordType: { type: 'string' },
              data: {},
            },
            ['recordType', 'data'],
          ),
        },
        ['context', 'payload'],
      ),
      execute: async (input) => core.writeProfileRecord(input.context, input.payload),
    },
    {
      name: 'amk_read_profile_record',
      description: 'Read a profile or prove record from the current AMK user scope.',
      inputSchema: createObjectSchema(
        {
          context: contextSchema,
          resourceRef: createObjectSchema(
            {
              recordType: { type: 'string' },
            },
            ['recordType'],
          ),
        },
        ['context', 'resourceRef'],
      ),
      execute: async (input) => core.readProfileRecord(input.context, input.resourceRef),
    },
    {
      name: 'amk_append_transcript_entry',
      description: 'Append a chat transcript entry into the current AMK scope.',
      inputSchema: createObjectSchema(
        {
          context: contextSchema,
          entry: createObjectSchema({
            role: { type: 'string' },
            content: { type: 'string' },
            ts: { type: 'string' },
          }, ['role', 'content']),
        },
        ['context', 'entry'],
      ),
      execute: async (input) => core.appendTranscriptEntry(input.context, input.entry),
    },
    {
      name: 'amk_read_transcript',
      description: 'Read chat transcript entries from the current AMK scope.',
      inputSchema: createObjectSchema(
        {
          context: contextSchema,
        },
        ['context'],
      ),
      execute: async (input) => core.readTranscript(input.context),
    },
    {
      name: 'amk_get_memory_namespace',
      description: 'Return the AMK memory namespace for the current context.',
      inputSchema: createObjectSchema(
        {
          context: contextSchema,
        },
        ['context'],
      ),
      execute: async (input) => core.getMemoryNamespace(input.context),
    },
  ];
}

export function createToolRegistry(core) {
  return Object.fromEntries(
    createToolDefinitions(core).map((tool) => [tool.name, tool.execute]),
  );
}

export function createHostToolDefinitions(core) {
  return createToolDefinitions(core);
}
