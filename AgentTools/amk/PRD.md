# OpenClaw AMK 插件一期 PRD

## 1. 目标

本期目标是把 OpenClaw AMK 做成一个可运行的“隔离路由层”，优先完成同一个 Agent 在不同用户、不同群组、不同会话下的文件与上下文隔离闭环。

一期只追求最小可交付：

- 能根据运行时上下文解析 `user` 或 `session` scope
- 能为 scope 自动创建独立目录
- 能保证文件读写与列目录不串数据
- 能输出独立的 memory namespace
- 能把 transcript 写入各自 scope 目录
- 能作为后续知识库隔离的基础底座

## 2. 范围

### 2.1 一期要做

- `user` / `session` 两种隔离模式
- scope 解析与标准化
- scope 存储目录创建与复用
- 文件写入、读取、列出
- transcript 独立落盘
- memory namespace 输出
- 插件核心 API 与工具适配层骨架

### 2.2 一期不做

- 完整 CLI 控制面
- 向量化检索与嵌入模型接入
- 复杂权限引擎
- 多业务 Skill 编排
- UI / Dashboard
- team / account / project 等多级 scope

## 3. 实现约束

### 3.1 技术栈

结合 `README.md` 与 `REF.md`，一期采用：

- Node.js 运行时
- ESM 模块结构
- 本地文件系统持久化
- JSON / JSONL 作为一期元数据与 transcript 存储格式
- 插件核心与 OpenClaw 接入层分离

说明：由于当前仓库没有 OpenClaw 官方插件模板，一期先实现“插件核心库 + 工具注册骨架”，把不确定的官方注册细节收敛在接入层里，避免影响核心隔离能力开发。

### 3.2 关键设计决策

- `user` 级隔离以 `agentId + platform + user` 作为稳定主键
- `user` 的 profile / memory / transcript / metadata 放在 Agent 维度下的插件稳定目录
- `user` 的文件优先写入当前 Agent workspace，符合每个 Agent 已有独立 workspace 的语义
- `session` 级隔离优先放在当前 workspace 下
- 若 workspace 不可用，`session` 回退到插件根目录
- 目录名不直接暴露原始 `userId` / `feishuUserId` / `sessionId`，统一使用稳定哈希
- 所有文件访问都必须经过 scope 路由层

## 4. 目录设计

### 4.1 插件根目录

默认插件根目录：

`<openclaw_data_root>/plugins/openclaw-amk/`

### 4.2 目录布局

```text
plugins/openclaw-amk/
  agents/
    <agent_id>/
      users/
        <platform>/
          <scope_hash>/
            profile/
            memory/
            transcripts/
            metadata/
            kb/
  scopes/
    sessions/
      <scope_hash>/
        files/
        profile/
        memory/
        transcripts/
        metadata/
        kb/
  runtime/
    locks/
    cache/
```

### 4.3 session 本地优先策略

当 `isolationMode=session` 且运行时可提供 `workspacePath` 时，session 目录优先创建在：

`<workspacePath>/.openclaw-amk/sessions/<scope_hash>/`

回退路径：

`<openclaw_data_root>/plugins/openclaw-amk/scopes/sessions/<scope_hash>/`

## 5. Scope 模型

### 5.1 输入上下文

一期 scope 解析允许以下字段参与：

- `platform`
- `userId`
- `feishuUserId`
- `sessionId`
- `channelId`
- `groupId`
- `chatId`
- `agentId`
- `workspacePath`

### 5.2 解析规则

- `isolationMode=user`：主键按 `agentId + platform + user` 解析
- Feishu 场景下若 `platform=feishu` 或显式传入 `feishuUserId`，则必须拿到 `feishuUserId`
- 非 Feishu 场景可使用 `userId`
- `isolationMode=session`：优先 `sessionId`，其次 `chatId` / `groupId` / `channelId`
- user scope 下 transcript 继续按 `sessionId` / `chatId` / `groupId` / `channelId` 拆分文件
- 关键字段缺失时必须报错，不允许模糊复用旧 scope

### 5.3 标准输出

scope 对象至少包含：

- `scopeType`
- `scopeId`
- `scopeHash`
- `scopePath`
- `fileRoot`
- `profileRoot`
- `memoryRoot`
- `transcriptRoot`
- `metadataRoot`
- `kbRoot`
- `memoryNamespace`
- `routingSource`
- `transcriptFileName`
- `transcriptFilePath`
- `transcriptRoutingSource`

## 6. 一期核心 API

### 6.1 插件核心 API

- `resolveScope(context)`
- `ensureScopeStorage(scope)`
- `listScopeFiles(scope, options)`
- `readScopeFile(scope, resourceRef)`
- `writeScopeFile(scope, payload)`
- `writeProfileRecord(scope, payload)`
- `readProfileRecord(scope, resourceRef)`
- `appendTranscriptEntry(scope, entry)`
- `readTranscript(scope)`
- `getMemoryNamespace(scope)`

### 6.2 工具适配层

一期先提供最小工具映射：

- `amk_resolve_scope`
- `amk_list_resources`
- `amk_read_resource`
- `amk_write_scope_file`
- `amk_write_profile_record`
- `amk_read_profile_record`
- `amk_append_transcript_entry`
- `amk_read_transcript`
- `amk_get_memory_namespace`

说明：工具适配层只做参数适配与返回结构包装，核心逻辑统一落在插件核心库中。

## 7. 数据与安全规则

- 文件只能写入和读取当前 scope 的 `files/` 子目录
- 禁止绝对路径写入和 `..` 路径穿透
- user scope 下 transcript 按当前 `sessionId` / `chatId` / `groupId` / `channelId` 路由到独立 `transcripts/*.jsonl`
- session scope 下 transcript 默认落到当前 scope 的 `transcripts/messages.jsonl`
- metadata 记录 scope 与路由信息，便于审计
- memory namespace 按 `user:<platform>:<agent>:<hash>` 或 `session:<hash>` 输出

## 8. 验收标准

### 8.1 user 模式

- 同一个 Agent 下，user A 与 user B 有独立目录
- user A 写入的文件 user B 不可读
- user A 的 profile / memory / transcript 与 user B 不同
- user A 的 memory namespace 与 user B 不同
- 同一 user 在不同 chat / session 下 transcript 文件独立

### 8.2 session 模式

- session A 与 session B 有独立目录
- workspace 可用时优先写入 workspace 内 session 目录
- workspace 不可用时回退到插件根目录 session 目录

### 8.3 transcript

- 不同 scope transcript 独立写入
- 重复读取只返回当前 scope 的记录

## 9. 开发拆分

### 阶段 1：核心隔离能力

- 配置装载
- scope 解析
- scope 存储创建
- 安全路径约束

### 阶段 2：文件闭环

- 写文件
- 读文件
- 列目录
- 资源元数据输出

### 阶段 3：上下文隔离

- transcript 独立落盘
- profile / prove 独立读写
- memory namespace 输出
- 工具注册骨架

## 10. 当前实现策略

由于当前无法直接确认 OpenClaw 官方插件注册细节，一期代码按“核心库优先、适配层后置”的方式实现：

1. 先把 scope / storage / files / transcript / namespace 做成可复用核心模块
2. 再通过统一工具注册层暴露给 OpenClaw
3. 等拿到更明确的 OpenClaw 插件运行时接口后，再补齐官方入口适配

## 11. 一句话结论

OpenClaw AMK 一期先落成一个稳定的隔离底座：同一个 Agent 在不同真实 user 或 session 下，文件、profile、transcript 与 memory namespace 都能独立路由，并为后续知识库能力预留统一结构。
