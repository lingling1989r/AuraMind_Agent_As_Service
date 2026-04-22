# OpenClaw AMK 集成与回归手册

这份文档基于当前仓库已经实现的代码、现有测试和安装脚本整理，目标是让 `docs/` 中的说明与项目真实行为保持一致。

它只覆盖当前一期已经落地的能力：scope 解析、目录隔离、作用域内文件访问、transcript 落盘、memory namespace 输出，以及最小 OpenClaw 工具注册与 memory slot 接入。

## 1. 当前定位

`openclaw-amk` 当前是一个 OpenClaw 一期隔离插件，`kind` 为 `memory`，但它并不是向量记忆插件。

当前版本已经实现：

- `session` / `user` 两种隔离模式
- scope 哈希与目录路由
- scope 内文件读、写、列目录
- transcript 追加写入与读取
- `memory namespace` 输出
- 面向宿主的 12 个一期工具注册
- `amk_init_user_scope` / `amk_prepare_user_turn` / `amk_commit_assistant_turn` 这组入口编排能力
- 作为 `plugins.slots.memory` 的 memory slot 插件接入宿主

当前版本没有实现：

- 向量检索
- 混合搜索
- memory store / recall / update / forget 一类长期记忆工具
- 知识库索引或嵌入模型
- 复杂权限系统
- team / project / account 等多级 scope

## 2. Scope 解析规则

### `session` 模式

`session` 模式下，scope 标识按以下优先级解析：

1. `sessionId`
2. `chatId`
3. `groupId`
4. `channelId`

如果以上字段都不存在，会直接报错。

### `user` 模式

`user` 模式下必须提供可路由到真实用户的标识。

当前一期优先支持：

- Feishu：`platform=feishu` 且提供 `feishuUserId`
- 通用场景：提供 `userId`

缺少这些标识时会直接报错。

### 稳定哈希

scope 目录名不会直接暴露原始标识，而是对 `"<scopeType>:<scopeId>"` 做 `sha256`，再取前 16 位十六进制字符串。

这保证了：

- 同一 scope 重复解析时目录稳定
- 不同 scope 的目录名可区分
- 目录名不会直接泄露原始 `userId` / `sessionId`

## 3. 目录落点

### `session` 模式：优先 workspace-local

当同时满足以下条件时：

- `isolationMode = session`
- `sessionStorage.preferWorkspaceLocal = true`
- 运行时上下文提供 `workspacePath`

scope 目录会优先写到：

```text
<workspacePath>/.openclaw-amk/sessions/<scope_hash>/
```

否则回退到：

```text
<openclaw_data_root>/plugins/openclaw-amk/scopes/sessions/<scope_hash>/
```

### `user` 模式

用户级 profile / memory / transcript / metadata 固定落到：

```text
<openclaw_data_root>/plugins/openclaw-amk/agents/<agent_id>/users/<platform>/<scope_hash>/
```

如果运行时提供 `workspacePath`，用户文件会单独写入当前 Agent workspace：

```text
<workspacePath>/users/<platform>/<scope_hash>/files/
```

如果没有 `workspacePath`，文件回退到上面的 user scope 目录内 `files/`。

### 当前 scope 目录结构

每个 user scope 当前都会创建以下子目录：

```text
files/
profile/
memory/
transcripts/
metadata/
kb/
```

并写入两份 metadata：

- `metadata/scope.json`
- `metadata/routing.json`

注意：当前实现每次执行 `ensureScopeStorage()` 都会重写这两份文件，因此更适合把它们视为“当前路由快照”，而不是一次写入后永久不变的审计日志。

## 4. 文件与 transcript 行为

### 文件访问边界

文件访问只允许发生在当前 scope 的 `files/` 目录下。

当前实现包含两层约束：

- 路径标准化：拒绝绝对路径和 `..` 穿透
- 根目录校验：计算后的最终路径必须仍位于当前 scope 根目录内

因此以下路径应视为非法输入：

- `/tmp/a.txt`
- `../a.txt`
- `../../secret.txt`

### 当前已实现的文件操作

- `writeScopeFile(context, payload)`
- `readScopeFile(context, resourceRef)`
- `listScopeFiles(context, options)`

返回结果都基于 scope 内的相对路径，不跨 scope 复用。

### transcript 行为

transcript 当前既可以通过核心 API 使用，也已经通过宿主工具暴露。

行为如下：

- `session` 模式默认按当前 session scope 读写 transcript
- `user` 模式下，同一 user scope 内会按 `sessionId` / `chatId` / `groupId` / `channelId` 路由到各自独立 transcript 文件
- 每次 `appendTranscriptEntry()` 追加一行 JSONL
- 如果调用时未提供 `ts`，会自动补一个 ISO 时间戳
- `readTranscript()` 按 JSONL 全量读回当前命中的 transcript 路由记录
- transcript 文件不存在时，`readTranscript()` 返回空数组

## 5. 当前宿主工具清单

当前通过宿主注册的工具有 12 个：

推荐优先接入的高阶入口：

- `amk_init_user_scope`
- `amk_prepare_user_turn`
- `amk_commit_assistant_turn`

保留的底层工具：

- `amk_resolve_scope`
- `amk_list_resources`
- `amk_read_resource`
- `amk_write_scope_file`
- `amk_write_profile_record`
- `amk_read_profile_record`
- `amk_append_transcript_entry`
- `amk_read_transcript`
- `amk_get_memory_namespace`

这意味着：

- 一期已经可以把“加好友初始化 / 用户消息进入 / assistant 回复提交”收口到 AMK 入口层
- `memory namespace` 当前仍然只是稳定路由值，不代表已经实现向量检索型长期记忆系统

## 6. 推荐验证顺序

在改代码或接入宿主后，建议按这个顺序验证。

### 1）仓库内回归测试

```bash
npm test
```

当前应覆盖三类事实：

- manifest 与入口对齐
- 宿主注册和最小工具闭环可用
- 核心 scope / 文件 / transcript / 安全路径行为正确

### 2）打包与安装烟测

```bash
npm run test:openclaw-install
```

该脚本会：

- 执行 `npm pack`
- 使用临时 `HOME` 安装插件 tarball
- 执行 `openclaw --profile <profile> config validate`
- 检查 profile 配置和安装目录是否创建成功
- 把 `plugins.slots.memory` 绑定到 `openclaw-amk` 后再次校验配置

这一步适合验证“包能否被 OpenClaw 正常安装，并完成最小 memory slot 绑定”，但仍不是完整功能闭环验证。

补充说明：`openclaw-amk` 作为 memory slot 装起来，意思是它被 OpenClaw 识别为当前激活的 `plugins.slots.memory` 插件。这里的 `memory` 表示宿主插件分类与 memory routing 入口，不等于当前插件已经提供向量检索或长期记忆工具。当前一期语义是：让 OpenClaw 把用户 scope、目录空间、transcript 和 `memoryNamespace` 路由交给 `openclaw-amk` 负责。

推荐再做一轮手动安装与多用户隔离验证：

1. 先运行仓库内回归：

```bash
npm run test:manifest
npm run test:host
npm run test:core
```

2. 打包：

```bash
npm pack
```

3. 安装到测试 profile：

```bash
openclaw --profile amk-smoke-test plugins install ./openclaw-amk-0.1.0.tgz
openclaw --profile amk-smoke-test config validate
```

4. 在全局主配置 `~/.openclaw/openclaw.json` 绑定 memory slot：

```json
{
  "plugins": {
    "enabled": true,
    "allow": ["openclaw-amk"],
    "entries": {
      "openclaw-amk": {
        "enabled": true
      }
    },
    "slots": {
      "memory": "openclaw-amk"
    }
  }
}
```

如果 profile 配置 `~/.openclaw-amk-smoke-test/openclaw.json` 已包含 `plugins.installs.openclaw-amk`，建议把这份 install 记录一并同步到全局主配置，然后执行：

```bash
openclaw config validate
openclaw gateway restart
```

5. 验证四个关键场景：

- 用户 A 首次消息：创建 A 的 scope、目录空间和 `memoryNamespace`
- 用户 B 首次消息：创建 B 的 scope、目录空间和 `memoryNamespace`，且与 A 不同
- A/B 数据不串：`profile`、`prove`、transcript、memory route、目录根都分开
- assistant 回复回写正确：A 的回复只进 A transcript，B 的回复只进 B transcript

如果上层宿主还没接真实消息流，可以直接用 `createAmkPlugin()` 做本地双用户验证：

```bash
node --input-type=module <<'EOF'
import { createAmkPlugin } from './src/index.js';

const plugin = createAmkPlugin({
  isolationMode: 'user',
  storage: { root: './.tmp-amk-smoke' },
});

const aUser = { platform: 'feishu', feishuUserId: 'liu-jie' };
const bUser = { platform: 'feishu', feishuUserId: 'wang-dage' };

const aScope = await plugin.initUserScope(aUser, {
  profile: { name: '刘姐', condition: 'hypertension' },
  prove: { source: 'pairing' },
});
const bScope = await plugin.initUserScope(bUser, {
  profile: { name: '王大哥', condition: 'other' },
  prove: { source: 'pairing' },
});

const aTurn = await plugin.prepareUserTurn(aUser, { content: '我是刘姐，我有高血压' });
const bTurn = await plugin.prepareUserTurn(bUser, { content: '我是王大哥，我是另一种情况' });

await plugin.commitAssistantTurn(aUser, { content: '收到，已记录刘姐信息' });
await plugin.commitAssistantTurn(bUser, { content: '收到，已记录王大哥信息' });

console.log(JSON.stringify({
  aNamespace: aTurn.memoryNamespace,
  bNamespace: bTurn.memoryNamespace,
  aScopePath: aScope.scope.scopePath,
  bScopePath: bScope.scope.scopePath,
  aTranscriptRoot: aTurn.scope.transcriptRoot,
  bTranscriptRoot: bTurn.scope.transcriptRoot,
  aProfileRoot: aTurn.scope.profileRoot,
  bProfileRoot: bTurn.scope.profileRoot,
}, null, 2));
EOF
```

验收标准：

- `aNamespace !== bNamespace`
- `aScopePath !== bScopePath`
- `aTranscriptRoot !== bTranscriptRoot`
- `aProfileRoot !== bProfileRoot`

### 3）真实宿主验证

如果本机有 OpenClaw 运行环境，再额外验证：

- `plugins.slots.memory` 是否已绑定到 `openclaw-amk`
- 插件能否被宿主加载
- `amk_*` 工具是否出现在宿主工具列表中
- memory capability 是否已注册到当前 memory slot
- `session` 模式下是否按预期写入 workspace-local 目录
- 不同 scope 是否真正隔离
- 修改配置后是否已执行 `openclaw gateway restart`

## 7. 推荐回归矩阵

### 集成

- `openclaw.plugin.json` 与 `package.json` 版本一致
- 插件入口 `index.js` 与 manifest 的 `id` / `kind` 一致
- manifest 中已声明安装说明与 Node 运行时要求
- 默认配置与 schema 默认值一致
- `plugins.slots.memory` 正确绑定到 `openclaw-amk`

### Scope 与目录

- `session` 模式优先使用 `workspacePath`
- 无 `workspacePath` 时回退到插件存储根目录
- `user` 模式输出稳定 `user:<hash>` namespace
- 不同 scope 的 `scopeHash` 不同

### 文件闭环

- 在同一 scope 内写入后可列出
- 在同一 scope 内可读回原始内容
- 另一个 scope 不能读到未创建的目录/文件
- 路径穿透会被拒绝

### transcript

- 能追加多条记录
- 读回顺序与写入顺序一致
- 自动补 `ts`
- 空 transcript 返回空数组

## 8. 常见误判

### 误判 1：把它当成向量记忆插件

当前插件只负责“隔离与路由底座”。`memory` 目录和 `memory namespace` 已预留，但没有实现向量索引、召回排序和长期记忆工具。

### 误判 2：看到 `kind: memory` 就以为有完整 memory toolset

这里的 `kind` 仅表示插件在宿主中的分类，不代表已经暴露 `memory_store` / `memory_recall` 一类工具。

### 误判 3：多个 memory 插件可以同时占用 `plugins.slots.memory`

多个 memory 类插件通常可以同时安装，但同一时刻只能有一个插件占用 `plugins.slots.memory`。

这意味着：

- `openclaw-amk` 可以和 `ref/memos` 一类插件同时存在于安装列表中
- 但它们不能同时都是当前激活的 memory slot
- 如果把另一个插件写进 `plugins.slots.memory`，它就会替代 `openclaw-amk` 成为当前生效的 slot

一期如果目标是“不同真实用户不串台”，推荐让 `openclaw-amk` 独占 memory slot，把用户隔离、目录路由、transcript 和 `memoryNamespace` 统一收口到 AMK。若未来要叠加 `ref/memos` 一类长期记忆能力，建议在上层编排中先调用 AMK，再把后续存储或召回链路接到 AMK 后面，而不是让两个插件同时争抢 slot。

### 误判 4：把 metadata 当成不可变审计日志

当前 `metadata/scope.json` 与 `metadata/routing.json` 会在 `ensureScopeStorage()` 时重写，适合作为当前状态快照，不应在文档里描述成严格不可变日志。

## 9. 文档维护规则

后续如果修改以下任一行为，应同步更新：

- `docs/openclaw-amk-integration-playbook.zh-CN.md`
- `README.md`
- 对应回归测试

重点关注这些变化：

- scope 解析优先级
- 目录落点
- 宿主工具列表
- transcript 暴露方式
- 安全路径规则
