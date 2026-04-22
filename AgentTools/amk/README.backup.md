# OpenClaw AMK

OpenClaw AMK 是一个面向 OpenClaw 的一期隔离插件。

它只做一期范围内已经实现的能力：

- 按 `session` 或 `user` 解析隔离 scope
- 为每个 scope 建立独立文件目录
- 在当前 scope 内列目录、读文件、写文件
- 为当前 scope 输出独立 `memory namespace`
- 把 transcript 落到当前 scope 目录

当前版本不包含向量检索、知识库索引、CLI 控制面、复杂权限模型，也不包含多级 scope。

## 当前状态

这个仓库现在已经是一个正式的 OpenClaw 插件包：

- 根入口：`index.js`
- 插件清单：`openclaw.plugin.json`
- 包声明：`package.json`
- 宿主工具注册：`src/runtime/tool-registry.js`

已完成两类验证：

- Node 层回归测试
- OpenClaw 本地安装 smoke test

## 适用场景

### 推荐用 `session` 模式

适合这些情况：

- 群聊、频道、临时任务流
- 同一个用户在不同会话之间不希望共享资料
- 希望 session 数据优先跟随当前 workspace

行为特点：

- scope 由 `sessionId`、`chatId`、`groupId`、`channelId` 解析
- 如果运行时提供 `workspacePath`，session 数据优先落到：
  - `<workspacePath>/.openclaw-amk/sessions/<scope_hash>/`
- 否则回退到：
  - `<openclaw_data_root>/plugins/openclaw-amk/scopes/sessions/<scope_hash>/`

### 推荐用 `user` 模式

适合这些情况：

- 客服、医疗、长期跟进
- 同一用户跨不同 agent 需要访问同一份私有资料
- 你希望用户资料放在稳定的 OpenClaw 数据目录中，而不是 workspace 内

行为特点：

- scope 由 `userId` 解析
- 数据落到：
  - `<openclaw_data_root>/plugins/openclaw-amk/scopes/users/<scope_hash>/`

## 初始配置建议

### 建议一：默认先用 `session`

如果你还不确定业务边界，先从这个配置开始：

```json
{
  "plugins": {
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

这样配的原因：

- 最符合一期目标
- 对临时任务和群聊最安全
- 有 `workspacePath` 时最容易观察隔离目录是否正确创建
- 不会把不同 session 的文件混到一起

### 建议二：客服/长期跟进改用 `user`

```json
{
  "plugins": {
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

这样配的原因：

- 同一用户跨 agent 可稳定落到同一 user scope
- 更适合长期私有资料沉淀
- 目录稳定，不依赖 workspace 生命周期

### 建议三：显式指定 OpenClaw 数据根目录

如果你希望测试和生产目录分开，建议显式配置 `openclawDataRoot`：

```json
{
  "plugins": {
    "entries": {
      "openclaw-amk": {
        "enabled": true,
        "config": {
          "enabled": true,
          "isolationMode": "session",
          "openclawDataRoot": "~/.openclaw-dev"
        }
      }
    }
  }
}
```

说明：

- 插件入口会先通过宿主 `api.resolvePath(...)` 解析路径
- 如果没有显式传 `storage.root`，插件会自动使用：
  - `<openclawDataRoot>/plugins/openclaw-amk`

### 不建议的一开始配置

当前一期里，不建议一开始就做这些：

- 不要加入未实现的 `vectorization`
- 不要加入未实现的 `sharedKnowledge`
- 不要假设存在搜索、ingest、知识库 CLI
- 不要把它当成完整 memory 检索插件

当前已暴露工具只有：

- `amk_resolve_scope`
- `amk_list_resources`
- `amk_read_resource`
- `amk_write_scope_file`
- `amk_get_memory_namespace`

## 安装

### 方式一：从本地目录打包后安装

这是当前最稳妥的正式安装方式，尤其适合本仓库包含 `ref/` 参考目录时。

先在仓库根目录打包：

```bash
npm pack
```

会生成类似文件：

```bash
openclaw-amk-0.1.0.tgz
```

然后安装到 OpenClaw：

```bash
openclaw plugins install /absolute/path/to/openclaw-amk-0.1.0.tgz
```

如果你想隔离本地测试环境，建议使用独立 profile：

```bash
openclaw --profile amk-smoke-test plugins install /absolute/path/to/openclaw-amk-0.1.0.tgz
```

为什么推荐 tarball 安装，而不是直接装仓库目录：

- OpenClaw 安装器会扫描安装源
- 当前仓库下的 `ref/` 目录包含参考项目和额外代码
- 直接安装仓库目录时，安全扫描可能把 `ref/` 一并算进去，导致误报并阻断安装
- `npm pack` 只会打包 `package.json.files` 允许发布的正式插件内容

## OpenClaw 配置

安装后，在 `openclaw.json` 中保留对应插件 entry。

最小示例：

```json
{
  "plugins": {
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

## 正式验证

### 1. 先跑仓库内测试

```bash
npm test
```

当前会执行：

- `node test/plugin-manifest-regression.mjs`
- `node test/openclaw-host-functional.mjs`

### 2. 再跑 OpenClaw 安装 smoke test

仓库里提供了正式安装 smoke 脚本：

```bash
bash scripts/smoke-openclaw-install.sh
```

这个脚本会做这些事：

- 先执行 `npm pack`
- 使用临时 `HOME` 和独立 profile 安装生成的 tarball
- 验证 profile 配置文件存在且可通过 `openclaw config validate`
- 验证插件安装目录存在
- 验证 `openclaw.json` 中已经写入 `plugins.entries.openclaw-amk`
- 结束后自动清理临时测试环境，因此可重复执行

### 3. 如需验证真实加载

安装完成后，可以再手动启动对应 profile 的 gateway：

```bash
openclaw --profile amk-smoke-test gateway
```

另一个终端里查看插件诊断：

```bash
openclaw --profile amk-smoke-test plugins doctor
```

说明：

- 如果 gateway 还没启动，`plugins doctor` 只能做静态检查
- 要验证“运行中已加载”，需要 gateway 实际启动

## 一期目录行为

### `session` 模式

有 `workspacePath` 时：

```text
<workspacePath>/.openclaw-amk/sessions/<scope_hash>/
```

没有 `workspacePath` 时：

```text
<openclaw_data_root>/plugins/openclaw-amk/scopes/sessions/<scope_hash>/
```

### `user` 模式

```text
<openclaw_data_root>/plugins/openclaw-amk/scopes/users/<scope_hash>/
```

每个 scope 目录下当前会用到这些子目录：

```text
files/
transcripts/
metadata/
memory/
kb/
```

## 已暴露工具

### `amk_resolve_scope`

输入当前上下文，返回当前使用的 scope。

### `amk_list_resources`

列出当前 scope 内的文件。

### `amk_read_resource`

读取当前 scope 内的文件。

### `amk_write_scope_file`

向当前 scope 写入文件。

### `amk_get_memory_namespace`

返回当前上下文对应的 namespace，格式为：

- `session:<hash>`
- `user:<hash>`

## 故障排查

### 直接安装仓库目录失败

常见表现：OpenClaw 提示危险代码模式或安全扫描失败。

原因通常不是本插件入口本身，而是仓库内 `ref/` 目录被一并扫描。

处理方式：

```bash
npm pack
openclaw plugins install /absolute/path/to/openclaw-amk-0.1.0.tgz
```

### `plugins doctor` 看不到运行态结果

先确认 gateway 已启动：

```bash
openclaw --profile amk-smoke-test gateway
```

### `config validate` 报配置文件不存在

先初始化或先通过安装命令生成 profile 配置。

例如：

```bash
openclaw --profile amk-smoke-test plugins install /absolute/path/to/openclaw-amk-0.1.0.tgz
openclaw --profile amk-smoke-test config validate
```

### session 数据没有写进 workspace

确认两点：

- 配置里 `isolationMode` 是 `session`
- 运行时上下文里确实提供了 `workspacePath`

## 本地开发命令

```bash
npm test
npm pack
bash scripts/smoke-openclaw-install.sh
```

## 一期边界

当前版本只承诺这些：

- scope 隔离
- 独立文件目录
- transcript 落盘
- memory namespace 路由
- 宿主插件入口与最小工具注册

当前版本不承诺这些：

- 向量检索
- 混合搜索
- 公共知识库
- ingest CLI
- 复杂权限策略
- 多业务 Skill 编排
