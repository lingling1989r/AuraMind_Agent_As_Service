# OpenClaw AMK

OpenClaw AMK 是一个面向 OpenClaw 的一期隔离插件，目标不是把 OpenClaw 继续当“只服务自己”的私人助理来用，而是先把它补成一个能够安全服务多个真实用户的运行时隔离层。

如果没有隔离层，OpenClaw 在面向外部用户提供服务时很容易出现三类根问题：

- 记忆隔离缺失：A 用户的资料、病史、偏好、证明材料可能混入 B 用户对话
- 存储隔离缺失：用户发来的文件、解压后的内容、生成出的附件可能落到宿主全局目录或其他用户目录
- 权限隔离缺失：当用户说“列出我工作区里的东西”“帮我找文件”时，Agent 很容易越过当前用户边界去读写宿主 workspace 里的其他内容

这三个问题不解决，OpenClaw 更适合作为个人助手，而不适合作为“一个 Agent 服务多个真实用户”的产品形态。

OpenClaw AMK 的一期目标，就是先把这条最小闭环补上：让宿主在真实消息流里，能够稳定地把文件、profile/prove、transcript、memory namespace 路由到当前用户自己的作用域下，并给文件类工具加上可解释、可验证的边界。

## 适用场景

- 一个 OpenClaw Agent 在 Feishu/IM/私聊里持续服务多个真实用户
- 用户会发送文件、压缩包、图片、证明材料，并要求后续继续读取和整理
- 用户会问“我工作区里有什么”“帮我找我刚才发的文件”这类文件问题
- 用户会在建联或问诊过程中提供年龄、身份、病史、诊断、证明等个人信息
- 业务侧要求不同用户绝不能串台，且宿主侧可以清楚验证隔离目录、隔离 transcript 和 memory namespace

## 一期能力边界

当前已经实现：

- 按 `session` 或 `user` 解析 scope
- 为每个 scope 创建独立目录
- 在当前 scope 内列目录、读文件、写文件
- 为当前上下文返回稳定的 `memory namespace`
- 把 transcript 落到当前 scope 的独立 `transcripts/*.jsonl`
- 把 `profile/profile.json` 与 `profile/prove.json` 作为用户资料与证明信息入口
- 向宿主注册 scope/file/profile/transcript 对应工具
- 在宿主运行时把当前用户隔离目录、profile/prove 和 memory namespace 注入上下文
- 对文件类工具做路径边界约束，避免跨用户访问

当前没有实现：

- 向量检索
- 混合搜索
- 长期记忆读写工具
- 知识库索引
- 复杂权限模型
- 多级 scope

更完整的集成、回归和排障说明见：`docs/openclaw-amk-integration-playbook.zh-CN.md`

## 工具清单

当前插件暴露的宿主工具有两层：

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

## 快速开始

### 前置要求

- Node.js `>=20`
- 本机已安装可用的 `openclaw` CLI
- 本地环境可执行 `npm pack`

### 给客户的安装说明（中文 / English）

OpenClaw CLI 命令本身与语言无关，所以中文环境和英文环境的安装步骤一致；差别主要只是你发给客户的说明文字。

中文可直接发：

```bash
openclaw plugins install /absolute/path/to/openclaw-amk-0.1.0.tgz
openclaw config validate
openclaw gateway restart
```

可配一句话说明：把我们提供的 `openclaw-amk-0.1.0.tgz` 安装到你的 OpenClaw，再执行校验和重启即可。

English version:

```bash
openclaw plugins install /absolute/path/to/openclaw-amk-0.1.0.tgz
openclaw config validate
openclaw gateway restart
```

Suggested note: install the `openclaw-amk-0.1.0.tgz` package we provide, validate the config, then restart the gateway.

如果后续要正式做多语言文档，建议保留当前 `README.md` 作为中文主文档，再补一份 `README_EN.md` 给海外客户；安装命令无需区分语言版本。

### 打包给别人使用

推荐把插件打成 tarball 再分发，而不是把整个仓库目录直接发给对方。

发布方操作：

```bash
npm install
npm test
npm pack
```

执行完成后，仓库根目录会生成一个类似下面的文件：

```bash
openclaw-amk-0.1.0.tgz
```

把这个 `.tgz` 文件发给对方即可。

接收方安装：

```bash
openclaw plugins install /absolute/path/to/openclaw-amk-0.1.0.tgz
openclaw config validate
openclaw gateway restart
```

如果接收方已经装过旧版本，先执行：

```bash
openclaw plugins uninstall openclaw-amk
```

如果安装时提示 `plugin already exists`，通常是旧目录还在，可先移走：

```bash
mv ~/.openclaw/extensions/openclaw-amk ~/.openclaw/openclaw-amk.bak
```

然后重新执行安装命令。

### 最短安装路径

```bash
npm pack
openclaw plugins install /absolute/path/to/openclaw-amk-0.1.0.tgz
openclaw config validate
openclaw gateway restart
```

当前更推荐用 tarball 安装，而不是直接把整个仓库目录交给 OpenClaw 安装器；这样可以避免把仓库里的 `ref/` 参考目录一起带进安装扫描。

### 卸载与升级

```bash
npm run plugin:uninstall
npm run plugin:purge
npm run plugin:upgrade
bash scripts/upgrade.sh --from /absolute/path/to/openclaw-amk-x.y.z.tgz
bash scripts/upgrade.sh --version x.y.z
```

说明：

- `plugin:uninstall` 默认只删除 `~/.openclaw/extensions/openclaw-amk`，保留现有配置和 memory/作用域数据
- `plugin:purge` 才会额外清理插件配置，以及默认数据目录 `~/.openclaw/plugins/openclaw-amk` 和工作区本地 `.openclaw-amk`
- `plugin:upgrade` 默认从当前仓库重新 `npm pack` 后重装，先备份 `openclaw.json`，默认保留用户配置和已有数据
- 也支持 `bash scripts/upgrade.sh --from /absolute/path/to/openclaw-amk-x.y.z.tgz`
- 以及 `bash scripts/upgrade.sh --version x.y.z`，用于从已发布包版本升级
- 如果你使用命名 profile，可在执行前设置 `OPENCLAW_AMK_PROFILE=<profile>` 或传 `--profile <name>`

## 最小配置

如果一期要先解决“同一个 Agent 服务不同真实用户”的隔离问题，推荐直接从 `user` 模式开始；`session` 模式用于同一用户在不同项目群/会话里的进一步拆分。

默认推荐配置：

```json
{
  "plugins": {
    "slots": {
      "memory": "openclaw-amk"
    },
    "entries": {
      "openclaw-amk": {
        "enabled": true,
        "config": {
          "enabled": true,
          "isolationMode": "user",
          "transcript": {
            "enabled": true
          },
          "memory": {
            "enabled": true
          }
        }
      }
    }
  }
}
```

如果你需要同一用户在不同项目群或会话里继续拆分，再切到 `session` 模式：

```json
{
  "plugins": {
    "slots": {
      "memory": "openclaw-amk"
    },
    "entries": {
      "openclaw-amk": {
        "enabled": true,
        "config": {
          "enabled": true,
          "isolationMode": "session",
          "sessionStorage": {
            "preferWorkspaceLocal": true
          },
          "transcript": {
            "enabled": true
          },
          "memory": {
            "enabled": true
          }
        }
      }
    }
  }
}
```

在 Feishu 场景下，运行时上下文应传入 `platform: "feishu"` 与 `feishuUserId`；`agentId` 会一起参与 user scope 主键，确保同一个真实用户在不同 Agent 下不会串数据。

配置改完后，至少执行一次：

```bash
openclaw config validate
openclaw gateway restart
```

如果你的 Agent 还同时启用了另一套 memory 检索链路，需要在宿主侧明确边界；一期推荐把 `plugins.slots.memory` 绑定到 `openclaw-amk`，并把“用户 profile / prove / transcript / memory namespace 路由”统一收口到 AMK 入口层，避免同一条用户链路同时走两套 memory 路由。

如果你希望接近 `ref/MemOS` 那种“入口先过自己的策略层，再往下走存储”的模式，一期建议宿主优先调用：

- `amk_init_user_scope`：加好友/首次建联时初始化用户隔离空间
- `amk_prepare_user_turn`：收到用户消息时，统一完成 user scope 初始化、读取 `profile/prove`、返回 `memoryNamespace`，并把用户消息写入 transcript
- `amk_commit_assistant_turn`：生成回复后，把 assistant 消息写回 transcript

这样即使不改 OpenClaw 核心，也能把主要接入面收敛到插件入口层，而不是让上层自己拼装底层工具。

## 安装后的隔离语义

当 `openclaw-amk` 作为当前激活的 `memory` slot 使用时，宿主会同时做两层约束：

- 工具层约束：拦截 shell/exec 类工具，并阻止访问当前 scope 目录之外的文件路径
- 提示层约束：在每轮提示词构造时，把“当前用户隔离目录 + 当前用户 profile/prove + 当前 memoryNamespace”注入上下文

这意味着在真实对话里，推荐按下面的产品语义理解：

- 用户发来的文件，应只接收到当前用户自己的隔离目录 `files/`
- 当用户说“列出我工作区里都有哪些东西”时，只应列出当前用户隔离目录内的内容
- 当用户要求读取、查找、操作其他目录、其他用户文件、宿主全局工作区时，应明确拒绝
- 当用户提到年龄、身份、病史、诊断、证明材料等个人信息时，应优先读写当前用户 scope 下的 `profile/profile.json` 与 `profile/prove.json`
- assistant 回复应继续落回当前用户自己的 transcript 路由，避免不同用户串台

如果你在上层 Agent 提示词里还要补业务规则，建议继续沿用这套边界：

- 文件类请求只面向当前 `scope.fileRoot`
- 用户资料类请求只面向当前 `profile/prove`
- 不要把“当前工作区”解释成宿主全局目录
- 不要把其他会话、其他用户、其他群聊的数据暴露给当前用户

## 与其他 memory 插件的关系

可以同时安装多个 memory 类插件，但同一时刻只能有一个插件占用 `plugins.slots.memory`。

这意味着：

- `openclaw-amk` 可以和其他 memory 插件同时安装
- 但 `openclaw-amk` 与 `ref/memos` 一类 memory 插件不能同时作为当前激活的 memory slot
- 如果后写入另一个插件到 `plugins.slots.memory`，`openclaw-amk` 就不再是当前生效的 memory slot

一期推荐策略：

- 如果目标是“不同真实用户绝不串台”，优先让 `openclaw-amk` 独占 `plugins.slots.memory`
- 不要同时让另一套 memory 插件也抢占同一个 slot
- 如果未来要和 `ref/memos` 一类能力结合，建议由上层策略先命中 `openclaw-amk` 做用户隔离与目录路由，再把后续长期记忆能力接到 AMK 后面，而不是让两个插件同时争抢 memory slot

## 验证

### 仓库内回归

```bash
npm test
```

当前会执行：

- `test/plugin-manifest-regression.mjs`
- `test/openclaw-host-functional.mjs`
- `test/core-scope-behavior.mjs`

### 安装烟测

```bash
npm run test:openclaw-install
```

这一步会验证：

- `npm pack` 能正常产出 tarball
- 插件可被 OpenClaw 安装
- profile 配置和安装目录能正确生成
- 把 `plugins.slots.memory` 绑定到 `openclaw-amk` 后仍可通过 `openclaw config validate`

### 手动安装与四个隔离场景验证

推荐先手动安装，再单独验证多用户不串台。

1. 运行仓库内回归：

```bash
npm run test:manifest
npm run test:host
npm run test:core
```

2. 打包插件：

```bash
npm pack
```

3. 安装到测试 profile：

```bash
openclaw --profile amk-smoke-test plugins install ./openclaw-amk-0.1.0.tgz
openclaw --profile amk-smoke-test config validate
```

4. 在全局主配置 `~/.openclaw/openclaw.json` 绑定 memory slot，而不是只写 profile 配置：

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

如果 profile 配置 `~/.openclaw-amk-smoke-test/openclaw.json` 已包含 `plugins.installs.openclaw-amk`，建议把这份 install 记录一并同步到全局主配置，再执行：

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

## 目录行为

### `session` 模式

有 `workspacePath` 时，优先写入：

```text
<workspacePath>/.openclaw-amk/sessions/<scope_hash>/
```

否则回退到：

```text
<openclaw_data_root>/plugins/openclaw-amk/scopes/sessions/<scope_hash>/
```

### `user` 模式

用户级 profile / memory / transcript / metadata 固定写入：

```text
<openclaw_data_root>/plugins/openclaw-amk/agents/<agent_id>/users/<platform>/<scope_hash>/
```

如果运行时提供 `workspacePath`，用户文件写入当前 Agent workspace：

```text
<workspacePath>/users/<platform>/<scope_hash>/files/
```

如果没有 `workspacePath`，文件回退到上面的用户 scope 目录内 `files/`。

每个 user scope 当前会创建：

```text
files/
profile/
memory/
transcripts/
metadata/
kb/
```

其中 `profile/profile.json` 与 `profile/prove.json` 可分别承载用户资料与业务证明信息。

同一 user scope 下，不同 `sessionId` / `chatId` / `groupId` / `channelId` 会路由到各自独立的 transcript 文件，而不是共用单个 `messages.jsonl`。

## 代码使用示例

```js
import { createAmkPlugin } from './index.js';

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

await plugin.appendTranscriptEntry(context, {
  role: 'user',
  content: '你好，我来复诊。',
});
```

更完整的行为说明、回归矩阵和常见误判，统一收敛在：`docs/openclaw-amk-integration-playbook.zh-CN.md`
