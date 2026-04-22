## Agent执行

智能体循环
智能体循环是智能体一次完整、“真实”的运行：输入接收 → 上下文组装 → 模型推理 → 工具执行 → 流式回复 → 持久化。它是将一条消息转换为操作和最终回复的权威路径，同时保持会话状态一致。
在 OpenClaw 中，循环是每个会话一次单独的串行运行；当模型思考、调用工具并流式输出内容时，它会发出生命周期事件和流事件。本文档解释这个真实循环如何进行端到端连接。
​
入口点
Gateway 网关 RPC：agent 和 agent.wait。
CLI：agent 命令。
​
工作原理（高级概览）
agent RPC 验证参数，解析会话（sessionKey/sessionId），持久化会话元数据，并立即返回 { runId, acceptedAt }。
agentCommand 运行智能体：
解析模型 + thinking/verbose 默认值
加载 Skills 快照
调用 runEmbeddedPiAgent（pi-agent-core 运行时）
如果嵌入式循环未发出 生命周期 end/error，则发出 lifecycle end/error
runEmbeddedPiAgent：
通过每会话队列 + 全局队列对运行进行串行化
解析模型 + 认证配置文件并构建 pi 会话
订阅 pi 事件并流式传输 assistant/tool 增量
强制超时；如果超过则中止运行
返回负载 + 用量元数据
subscribeEmbeddedPiSession 将 pi-agent-core 事件桥接到 OpenClaw agent 流：
工具事件 => stream: "tool"
assistant 增量 => stream: "assistant"
生命周期事件 => stream: "lifecycle"（phase: "start" | "end" | "error"）
agent.wait 使用 waitForAgentRun：
等待 runId 的 生命周期 end/error
返回 { status: ok|error|timeout, startedAt, endedAt, error? }
​
排队 + 并发
运行会按每个会话键（会话通道）串行化，并可选择通过全局通道。
这可防止工具/会话竞争，并保持会话历史一致。
消息渠道可以选择队列模式（collect/steer/followup），这些模式会接入这个通道系统。 参见 命令队列。
​
会话 + 工作区准备
工作区会被解析并创建；沙箱隔离运行可能会重定向到沙箱工作区根目录。
Skills 会被加载（或从快照复用），并注入到环境变量和提示词中。
Bootstrap/上下文文件会被解析并注入到系统提示词报告中。
会获取会话写锁；SessionManager 会在流式传输前打开并准备好。
​
提示词组装 + 系统提示词
系统提示词由 OpenClaw 的基础提示词、Skills 提示词、Bootstrap 上下文和每次运行的覆盖项构建而成。
会强制执行特定于模型的限制和压缩预留 token。
关于模型能看到什么，请参见 系统提示词。
​
Hook 点（你可以在哪里拦截）
OpenClaw 有两套 hook 系统：
内部 hooks（Gateway 网关 hooks）：用于命令和生命周期事件的事件驱动脚本。
插件 hooks：位于智能体/工具生命周期和 Gateway 网关管道中的扩展点。
​
内部 hooks（Gateway 网关 hooks）
agent:bootstrap：在系统提示词最终确定之前、构建 Bootstrap 文件时运行。 用它来添加/移除 Bootstrap 上下文文件。
命令 hooks：/new、/reset、/stop 和其他命令事件（参见 Hooks 文档）。
设置和示例请参见 Hooks。
​
插件 hooks（智能体 + Gateway 网关生命周期）
这些会在智能体循环内部或 Gateway 网关管道中运行：
before_model_resolve：在会话前运行（无 messages），以在模型解析前确定性地覆盖提供商/模型。
before_prompt_build：在会话加载后运行（带 messages），以在提交提示词前注入 prependContext、systemPrompt、prependSystemContext 或 appendSystemContext。对每轮动态文本使用 prependContext，对应该位于系统提示词空间中的稳定指导使用系统上下文字段。
before_agent_start：旧版兼容 hook，可能在任一阶段运行；优先使用上面的显式 hooks。
before_agent_reply：在内联操作之后、LLM 调用之前运行，让插件接管当前轮次并返回合成回复，或完全静默该轮次。
agent_end：在完成后检查最终消息列表和运行元数据。
before_compaction / after_compaction：观察或标注压缩周期。
before_tool_call / after_tool_call：拦截工具参数/结果。
before_install：检查内置扫描结果，并可选择阻止 Skills 或插件安装。
tool_result_persist：在工具结果写入会话记录之前，同步转换工具结果。
message_received / message_sending / message_sent：入站 + 出站消息 hooks。
session_start / session_end：会话生命周期边界。
gateway_start / gateway_stop：Gateway 网关生命周期事件。
用于出站/工具保护的 hook 决策规则：
before_tool_call：{ block: true } 是终止性的，会阻止更低优先级处理器。
before_tool_call：{ block: false } 是无操作，不会清除先前的阻止状态。
before_install：{ block: true } 是终止性的，会阻止更低优先级处理器。
before_install：{ block: false } 是无操作，不会清除先前的阻止状态。
message_sending：{ cancel: true } 是终止性的，会阻止更低优先级处理器。
message_sending：{ cancel: false } 是无操作，不会清除先前的取消状态。
Hook API 和注册细节请参见 插件 hooks。
​
流式传输 + 部分回复
assistant 增量会从 pi-agent-core 流式传输，并作为 assistant 事件发出。
分块流式传输可以在 text_end 或 message_end 时发出部分回复。
推理流式传输可以作为单独的流发出，或作为分块回复发出。
关于分块和分块回复行为，请参见 流式传输。
​
工具执行 + 消息工具
工具 start/update/end 事件会在 tool 流上发出。
工具结果在记录/发出之前，会针对大小和图像负载进行清理。
会跟踪消息工具发送，以抑制重复的 assistant 确认消息。
​
回复塑形 + 抑制
最终负载由以下内容组装而成：
assistant 文本（以及可选的推理内容）
内联工具摘要（当 verbose + 允许时）
当模型报错时的 assistant 错误文本
精确的静默 token NO_REPLY / no_reply 会从出站 负载中过滤掉。
消息工具重复项会从最终负载列表中移除。
如果没有可渲染的负载剩余且工具出错，则会发出后备工具错误回复 （除非消息工具已经发送了用户可见的回复）。
​
压缩 + 重试
自动压缩会发出 compaction 流事件，并且可能触发重试。
重试时，会重置内存缓冲区和工具摘要，以避免重复输出。
关于压缩管道，请参见 压缩。
​
事件流（当前）
lifecycle：由 subscribeEmbeddedPiSession 发出（并由 agentCommand 作为后备发出）
assistant：来自 pi-agent-core 的流式增量
tool：来自 pi-agent-core 的流式工具事件
​
聊天渠道处理
assistant 增量会被缓冲为聊天 delta 消息。
聊天 final 会在 生命周期 end/error 时发出。
​
超时
agent.wait 默认值：30s（仅等待）。可用 timeoutMs 参数覆盖。
智能体运行时：agents.defaults.timeoutSeconds 默认值为 172800s（48 小时）；在 runEmbeddedPiAgent 的中止计时器中强制执行。
LLM 空闲超时：agents.defaults.llm.idleTimeoutSeconds 会在空闲窗口内没有收到响应分块时中止模型请求。对于较慢的本地模型或推理/工具调用提供商，请显式设置它；将其设为 0 可禁用。如果未设置，OpenClaw 会在已配置时使用 agents.defaults.timeoutSeconds，否则使用 60s。由 cron 触发且未显式设置 LLM 或智能体超时的运行，会禁用空闲监视器，并依赖 cron 外层超时。
​
可能提前结束的地方
智能体超时（中止）
AbortSignal（取消）
Gateway 网关断开连接或 RPC 超时
agent.wait 超时（仅等待，不会停止智能体）
​
相关内容
工具 — 可用的智能体工具
Hooks — 由智能体生命周期事件触发的事件驱动脚本
压缩 — 长对话如何被总结
Exec 审批 — shell 命令的审批门控
Thinking — thinking/推理级别配置

## Agent 运行时

智能体运行时
OpenClaw 运行一个单一的内置智能体运行时。
​
工作区（必需）
OpenClaw 使用单个智能体工作区目录（agents.defaults.workspace）作为智能体工具和上下文的唯一工作目录（cwd）。
建议：如果 ~/.openclaw/openclaw.json 不存在，请使用 openclaw setup 创建它并初始化工作区文件。
完整的工作区布局和备份指南： 智能体工作区
如果启用了 agents.defaults.sandbox，非主会话可以通过 agents.defaults.sandbox.workspaceRoot 下的按会话划分工作区覆盖此设置（参见 Gateway 网关配置）。
​
引导文件（注入）
在 agents.defaults.workspace 内，OpenClaw 期望存在以下可由用户编辑的文件：
AGENTS.md — 操作说明 + “记忆”
SOUL.md — 人设、边界、语气
TOOLS.md — 用户维护的工具说明（例如 imsg、sag、约定）
BOOTSTRAP.md — 一次性的首次运行仪式（完成后删除）
IDENTITY.md — 智能体名称/风格/emoji
USER.md — 用户资料 + 偏好的称呼方式
在新会话的第一轮中，OpenClaw 会将这些文件的内容直接注入到智能体上下文中。
空白文件会被跳过。大文件会被裁剪并附带截断标记，以保持提示精简（如需完整内容，请直接读取文件）。
如果某个文件缺失，OpenClaw 会注入一行“文件缺失”标记（并且 openclaw setup 会创建一个安全的默认模板）。
BOOTSTRAP.md 仅会为全新的工作区创建（即不存在其他引导文件时）。如果你在完成仪式后将其删除，之后重启时不应重新创建。
如需完全禁用引导文件创建（用于预置工作区），请设置：
{ agent: { skipBootstrap: true } }
​
内置工具
核心工具（read/exec/edit/write 及相关系统工具）始终可用， 但受工具策略约束。apply_patch 是可选的，并受 tools.exec.applyPatch 控制。TOOLS.md 不控制哪些工具存在；它只是 指导你希望如何使用这些工具。
​
Skills
OpenClaw 会从以下位置加载 Skills（优先级从高到低）：
工作区：<workspace>/skills
项目智能体 Skills：<workspace>/.agents/skills
个人智能体 Skills：~/.agents/skills
托管/本地：~/.openclaw/skills
内置项（随安装提供）
额外 Skills 文件夹：skills.load.extraDirs
Skills 可以通过配置/环境变量进行控制（参见 Gateway 网关配置 中的 skills）。
​
运行时边界
内置智能体运行时构建在 Pi 智能体核心之上（模型、工具和 提示管线）。会话管理、发现、工具接线和渠道投递则是 OpenClaw 在该核心之上拥有的分层。
​
会话
会话转录以 JSONL 格式存储在以下位置：
~/.openclaw/agents/<agentId>/sessions/<SessionId>.jsonl
会话 ID 是稳定的，由 OpenClaw 选择。 不会读取来自其他工具的旧版会话文件夹。
​
流式传输期间的引导控制
当队列模式为 steer 时，入站消息会被注入到当前运行中。 排队的引导控制消息会在当前 assistant 轮完成其工具调用执行之后、下一次 LLM 调用之前送达。引导控制不再跳过当前 assistant 消息中剩余的工具调用；而是在下一个模型边界注入排队消息。
当队列模式为 followup 或 collect 时，入站消息会被保留到 当前轮结束，然后用排队负载启动一个新的智能体轮。参见 队列 了解模式以及 debounce/cap 行为。
分块流式传输会在 assistant 块完成后立即发送；它 默认关闭（agents.defaults.blockStreamingDefault: "off"）。 可通过 agents.defaults.blockStreamingBreak 调整边界（text_end 或 message_end；默认为 text_end）。 使用 agents.defaults.blockStreamingChunk 控制软性分块（默认 800–1200 个字符；优先按段落分隔，其次是换行，最后是句子）。 使用 agents.defaults.blockStreamingCoalesce 合并流式分块，以减少 单行刷屏（发送前基于空闲时间进行合并）。非 Telegram 渠道需要 显式设置 *.blockStreaming: true 才能启用分块回复。 详细工具摘要会在工具启动时发出（无 debounce）；Control UI 会在可用时通过智能体事件流式传输工具输出。 更多细节： 流式传输 + 分块。
​
模型引用
配置中的模型引用（例如 agents.defaults.model 和 agents.defaults.models）会通过在第一个 / 处分割来解析。
配置模型时请使用 provider/model。
如果模型 ID 本身包含 /（OpenRouter 风格），请包含提供商前缀（示例：openrouter/moonshotai/kimi-k2）。
如果你省略提供商，OpenClaw 会先尝试别名，然后尝试对该确切模型 id 的唯一 已配置提供商匹配，最后才回退到已配置的默认提供商。如果该提供商不再提供 已配置的默认模型，OpenClaw 会回退到第一个已配置的 提供商/模型，而不是暴露一个陈旧的、已移除提供商默认值。
​
配置（最小）
至少设置以下项：
agents.defaults.workspace
channels.whatsapp.allowFrom（强烈建议）


## Agent 工作区
智能体工作区
工作区是智能体的“家”。它是 文件工具和工作区上下文使用的唯一工作目录。请保持其私密，并将其视为记忆。
这与 ~/.openclaw/ 分开，后者存储配置、凭证和 会话。
重要： 工作区是默认 cwd，而不是硬性沙箱。工具 会基于工作区解析相对路径，但绝对路径仍然可以访问主机上的其他位置，除非启用了沙箱隔离。如果你需要隔离，请使用 agents.defaults.sandbox（和/或按智能体的沙箱配置）。 当启用沙箱隔离且 workspaceAccess 不为 "rw" 时，工具会在 ~/.openclaw/sandboxes 下的沙箱工作区内运行，而不是在你的主机工作区中运行。
​
默认位置
默认值：~/.openclaw/workspace
如果设置了 OPENCLAW_PROFILE 且不为 "default"，默认值会变为 ~/.openclaw/workspace-<profile>。
可在 ~/.openclaw/openclaw.json 中覆盖：
{
  agent: {
    workspace: "~/.openclaw/workspace",
  },
}
openclaw onboard、openclaw configure 或 openclaw setup 会在 工作区不存在时创建该工作区并填充 bootstrap 文件。 沙箱种子复制仅接受工作区内的常规文件；解析到源工作区外部的符号链接/硬链接别名会被忽略。
如果你已经自行管理工作区文件，可以禁用 bootstrap 文件创建：
{ agent: { skipBootstrap: true } }
​
额外的工作区文件夹
较旧的安装可能创建过 ~/openclaw。保留多个工作区 目录可能导致令人困惑的鉴权或状态漂移，因为同一时间只有一个 工作区处于活动状态。
建议： 仅保留一个活动工作区。如果你不再使用这些 额外文件夹，请归档或移到废纸篓（例如 trash ~/openclaw）。 如果你有意保留多个工作区，请确保 agents.defaults.workspace 指向当前活动的那个。
当检测到额外工作区目录时，openclaw doctor 会发出警告。
​
工作区文件映射（每个文件的含义）
这些是 OpenClaw 在工作区中预期的标准文件：
AGENTS.md
智能体的操作说明，以及它应如何使用记忆。
在每次会话开始时加载。
很适合放置规则、优先级以及“如何表现”的细节。
SOUL.md
人设、语气和边界。
每个会话都会加载。
指南：SOUL.md Personality Guide
USER.md
用户是谁，以及如何称呼用户。
每个会话都会加载。
IDENTITY.md
智能体的名称、风格和 emoji。
在 bootstrap 仪式期间创建/更新。
TOOLS.md
关于你的本地工具和约定的说明。
它不控制工具可用性；仅作为指导。
HEARTBEAT.md
可选的小型检查清单，用于 heartbeat 运行。
保持简短，以避免 token 消耗。
BOOT.md
可选的启动检查清单；当启用内部 hooks 时，会在 Gateway 网关重启时执行。
保持简短；使用消息工具进行出站发送。
BOOTSTRAP.md
一次性的首次运行仪式。
仅为全新工作区创建。
仪式完成后请删除它。
memory/YYYY-MM-DD.md
每日记忆日志（每天一个文件）。
建议在会话开始时阅读今天和昨天的内容。
MEMORY.md（可选）
整理后的长期记忆。
仅在主私有会话中加载（不在共享/群组上下文中加载）。
有关工作流和自动记忆刷新，请参见记忆。
skills/（可选）
工作区专用的 Skills。
该工作区中优先级最高的 Skills 位置。
当名称冲突时，会覆盖项目智能体 Skills、个人智能体 Skills、托管 Skills、内置 Skills 以及 skills.load.extraDirs。
canvas/（可选）
用于节点显示的 Canvas UI 文件（例如 canvas/index.html）。
如果任何 bootstrap 文件缺失，OpenClaw 会向 会话中注入一个“缺失文件”标记并继续。大型 bootstrap 文件在注入时会被截断； 可通过 agents.defaults.bootstrapMaxChars（默认：20000）和 agents.defaults.bootstrapTotalMaxChars（默认：150000）调整限制。 openclaw setup 可以重新创建缺失的默认文件，而不会覆盖现有 文件。
​
哪些内容不在工作区中
这些内容位于 ~/.openclaw/ 下，不应提交到工作区仓库：
~/.openclaw/openclaw.json（配置）
~/.openclaw/agents/<agentId>/agent/auth-profiles.json（模型鉴权配置：OAuth + API 密钥）
~/.openclaw/credentials/（渠道/提供商状态以及旧版 OAuth 导入数据）
~/.openclaw/agents/<agentId>/sessions/（会话转录 + 元数据）
~/.openclaw/skills/（托管 Skills）
如果你需要迁移会话或配置，请单独复制它们，并确保将其 排除在版本控制之外。
​
Git 备份（推荐，私有）
请将工作区视为私有记忆。把它放到一个私有 git 仓库中，以便 进行备份和恢复。
请在运行 Gateway 网关的机器上执行以下步骤（工作区就在 那里）。
​
1）初始化仓库
如果已安装 git，全新的工作区会自动初始化。如果该 工作区尚不是仓库，请运行：
cd ~/.openclaw/workspace
git init
git add AGENTS.md SOUL.md TOOLS.md IDENTITY.md USER.md HEARTBEAT.md memory/
git commit -m "Add agent workspace"
​
2）添加私有远程仓库（适合初学者的选项）
选项 A：GitHub Web UI
在 GitHub 上创建一个新的私有仓库。
不要使用 README 初始化（可避免合并冲突）。
复制 HTTPS 远程 URL。
添加远程仓库并推送：
git branch -M main
git remote add origin <https-url>
git push -u origin main
选项 B：GitHub CLI（gh）
gh auth login
gh repo create openclaw-workspace --private --source . --remote origin --push
选项 C：GitLab Web UI
在 GitLab 上创建一个新的私有仓库。
不要使用 README 初始化（可避免合并冲突）。
复制 HTTPS 远程 URL。
添加远程仓库并推送：
git branch -M main
git remote add origin <https-url>
git push -u origin main
​
3）持续更新
git status
git add .
git commit -m "Update memory"
git push
​
不要提交密钥
即使在私有仓库中，也应避免在工作区存储密钥：
API 密钥、OAuth 令牌、密码或私有凭证。
~/.openclaw/ 下的任何内容。
聊天记录原始转储或敏感附件。
如果你必须存储敏感引用，请使用占位符，并将真实 密钥保存在其他地方（密码管理器、环境变量或 ~/.openclaw/）。
建议的 .gitignore 起始内容：
.DS_Store
.env
**/*.key
**/*.pem
**/secrets*
​
将工作区迁移到新机器
将仓库克隆到目标路径（默认 ~/.openclaw/workspace）。
在 ~/.openclaw/openclaw.json 中将 agents.defaults.workspace 设置为该路径。
运行 openclaw setup --workspace <path> 以填充缺失文件。
如果你还需要会话，请将 ~/.openclaw/agents/<agentId>/sessions/ 从 旧机器单独复制过来。
​
高级说明
多智能体路由可以为不同智能体使用不同工作区。参见 渠道路由 了解路由配置。
如果启用了 agents.defaults.sandbox，非主会话可以在 agents.defaults.sandbox.workspaceRoot 下 使用按会话划分的沙箱工作区。
​
相关内容
Standing Orders — 工作区文件中的持久指令
Heartbeat — HEARTBEAT.md 工作区文件
会话 — 会话存储路径
沙箱隔离 — 沙箱环境中的工作区访问



## 文档版本：v2.3 | 更新日期：2026-03-12 | 分析对象：openclaw/openclaw
前置阅读：02-agent-runtime.md（Agent Loop、Context 组装）。本文聚焦 Session 生命周期与 Memory 持久化，Context 组装的 Token 预算与修剪策略详见 02 §6。
功能实现状态
模块	功能	状态	章节
Session	创建 / 查找 / 生命周期管理	✅ 已实现	§2.1-2.4
Session	Sliding Window 修剪	✅ 已实现	§2.5
Session	Summary Compression	📋 规划中	§2.5
Session	Importance Scoring 修剪	📋 规划中	§2.5
Memory	6 类记忆 Schema + L0/L1/L2 分层	✅ 已实现	§3.1-3.2
检索	BM25 + Vector 混合检索 (文件后端)	✅ 已实现	§4.1-4.3
检索	sqlite-vec 后端	⚙️ 可选 (已集成)	§4.3
检索	Reranking (Cross-Encoder)	⚙️ 可选 (默认关闭)	§4.1
检索	多语言分词 (中/日/韩/英/阿)	✅ 已实现	§4.5
FSRS	FSRS-6 时效性加权	✅ 已实现	§5.1-5.2
写入	自动提取 + 去重 + 限流	✅ 已实现	§6.1
写入	错误降级 (LLM/Embedding/持久化)	✅ 已实现	§6.1
反思	LLM 反思 + 洞察层	✅ 已实现	§7
跨 Agent	共享 User Memory	✅ 已实现	§8
迁移	导入 / 导出	✅ 已实现	§9
迁移	跨版本格式自动升级	📋 规划中	§9
安全	本地存储 + 文件权限	✅ 已实现	§12
安全	AES-256-GCM 静态加密	📋 规划中	§12
1. 定位
Session 管理"短期记忆"（单次对话上下文），Memory 管理"长期记忆"（跨会话持久知识）。两者配合让 Agent 既能连贯对话，又能"记住"用户的偏好和历史。

每轮结束 → 提取写入会话开始 → 检索注入长期记忆 (Memory)偏好 · 档案 · 事件 · 经验 · 洞察生命周期: 永久 · memory/短期记忆 (Session)消息历史 · 工具调用 · 临时变量生命周期: 会话内 · sessions/

2. Session 管理
2.1 Session 数据结构
  ~/.openclaw/agents//sessions//
  ├── meta.json             Session 元数据
  ├── messages.jsonl        消息历史（追加写入, JSONL 格式）
  └── context.json          上下文快照（修剪后的缓存）

  meta.json:
  {
    "sessionId": "s-abc123",
    "agentId": "main",
    "channel": "telegram",
    "chatId": "123456789",
    "userId": "123456789",
    "createdAt": "2026-02-04T10:00:00Z",
    "lastActiveAt": "2026-02-26T14:30:00Z",
    "messageCount": 47,
    "totalInputTokens": 65200,
    "totalOutputTokens": 20000,
    "totalCost": 0.085,
    "status": "active",
    "model": "moonshot/kimi-k2.5",
    "summaryCheckpoint": 20       // Summary Compression 的最后压缩位置
  }
2.2 消息存储格式
  messages.jsonl (每行一条消息, 追加写入):

  {"idx":0,"role":"user","content":"你好","ts":"2026-02-04T10:00:00Z","tokens":5}
  {"idx":1,"role":"assistant","content":"你好！有什么可以帮你的？","ts":"...","tokens":15}
  {"idx":2,"role":"user","content":"帮我清一下邮件","ts":"...","tokens":8}
  {"idx":3,"role":"assistant","content":"","toolCalls":[{"id":"tc-1","name":"gmail.list","args":{}}],"ts":"...","tokens":20}
  {"idx":4,"role":"tool","toolCallId":"tc-1","content":"{...邮件列表...}","ts":"...","tokens":350}
  {"idx":5,"role":"assistant","content":"你有5封新邮件...","ts":"...","tokens":80}

  为什么用 JSONL 而不是 JSON 数组？
  • 追加写入: 不需要读取全部 → 修改 → 重写
  • 崩溃安全: 写到一半最多丢最后一条
  • 流式友好: 可以按行读取,不需要全部加载

  并发安全:
  • 单 Agent 串行处理消息 (Agent Loop 内无并发写入同一 Session)
  • 跨 Agent 写不同 Session → 无冲突
  • 极端场景: 同一 chatId 在 idle_timeout 前后快速连发
    → SessionManager 内部用 per-key mutex 保护 getOrCreate
    → 保证同一时刻只有一个 Agent Loop 持有该 Session
2.3 Session 生命周期
idle_timeout (30min)新消息到来7天无活动创建活跃 (active)休眠 (dormant)归档 (archived)

各状态说明：

• 创建：新用户首次消息、显式 session.create、或 /session new 命令
• active：持续有消息交互，每条消息更新 lastActiveAt，追加到 messages.jsonl
• dormant：序列化到磁盘，释放内存（5MB → 1KB），保留 meta.json
• archived：消息历史压缩归档，meta.json 标记 status: archived，关键事实已持久化到 Memory
2.4 Session 查找策略
命中未命中命中未找到用户消息到达构建 keychannel:chatId内存 Map 查找使用该 Session磁盘扫描meta.json 匹配加载到内存创建新 Session

查找逻辑：

• key 构建：channel:chatId，例 telegram:123456789
• 磁盘查找：扫描 sessions/*/meta.json，匹配 channel + chatId + status ≠ archived
• 新建：sessionId = s- + uuidv7()，创建目录 + 写入 meta.json
优化：启动时加载所有 meta.json 到内存 Map，不加载 messages（按需加载）。
Group Chat：群聊场景下 chatId 为群组 ID，同一群内所有用户共享一个 Session。消息中的 sender.userId 区分发言人，记忆提取时按 userId 分别写入各自的 User Memory。详见 02-agent-runtime.md §5 中的 DM/Group 策略差异。
2.5 会话历史修剪与 Summary Compression
meta.json 中的 summaryCheckpoint 字段标记 Summary Compression 的最后压缩位置。修剪策略由 Agent 配置 context.pruneStrategy 决定，详细算法见 02-agent-runtime.md §6.3，此处仅说明 Session 侧的存储行为：

  ┌────────────────────────────────────────────────────────────┐
  │  Sliding Window (默认, 已实现):                              │
  │  • Session 不做任何预处理                                    │
  │  • Context 组装时从 messages.jsonl 尾部按 Token 预算截取     │
  │  • messages.jsonl 保留全量（归档前不删除）                    │
  │                                                             │
  │  Summary Compression (规划中):                               │
  │  • 消息数 > threshold (默认 30) 时触发                       │
  │  • 对索引 0 到 summaryCheckpoint 的消息生成摘要              │
  │  • 摘要写入 context.json，更新 summaryCheckpoint             │
  │  • Context 组装: [摘要] + [checkpoint 之后的原始消息]        │
  │  • 原始 messages.jsonl 不删除（审计可追溯）                  │
  │                                                             │
  │  Importance Scoring (规划中):                                │
  │  • 每条消息附带重要性评分 → 优先保留高分消息                 │
  │  • 适合长周期任务对话                                        │
  └────────────────────────────────────────────────────────────┘
3. Memory 系统（长期记忆）
3.1 记忆 Schema
OpenClaw 的记忆分为 User Memory 和 Agent Memory：

Agent Memorylesson 经验pattern 模式case 案例User Memoryprofile 档案preference 偏好event 事件

合并策略总结：

类型	mergeStrategy	说明
profile	overwrite	新值直接覆盖旧值
preference	latest-wins	保留最新的偏好表达
event	no-merge	每条独立, 永不合并
lesson	append	追加新经验
pattern	latest-wins	持续精炼, 保留最新版
case	no-merge	每条独立, 永不合并
关键规则：档案/偏好 → 总是合并（新覆盖旧）；事件/案例 → 永远不合并（每条独立）。搞反了 = 灾难（偏好丢失 or 事件重复）。
3.2 三级内容模型 (L0/L1/L2)
命中后显式请求L0 ~100 tokens摘要 · 索引/去重/EmbeddingL1 ~500 tokens概览 · 按需加载L2 不限完整原文 · 按 id 加载

各层职责：

• L0：每次检索都加载到 Context。例：用户偏好 TypeScript，不喜欢 Java
• L1：模型需要更多细节时展开。例：用户多次表达对 TS 的偏好
• L2：包含原始对话片段和时间戳，仅 memory.get(id) 时按需加载
为什么分层？ 10,000 条记忆 × L2 全文 = 几十万 Token 检索成本。分层后：索引只用 L0 → 命中后按需展开 → 节省 90%+。Context 中通常注入 Top-K 条 L0 摘要（~100 tokens × 10 = 1K），特别相关时自动展开为 L1。
4. 混合检索引擎
支持 BM25 + 向量 + Reranking 三路混合搜索（架构自 v2026.2.2 引入）。

存储后端演进：v2026.2.2 初版使用自建 JSON 倒排索引 + hnswlib-node HNSW 索引（零外部依赖）；v2026.2.22 起引入 sqlite-vec 作为可选后端（package.json 已列为依赖），可统一管理向量和元数据。两种后端通过 memory.backend 配置切换，默认仍为文件索引方案。
4.1 检索流程
否是用户查询[1] 预处理关键词 · Embedding · 语言检测[2a] BM25 稀疏检索Top-50[2b] Vector 密集检索Top-50[3] 加权 RRF 融合Reranking?[5] FSRS-6 加权[4] Reranking 精排bge-reranker-v2-m3[6] 返回 Top-K

各步骤说明：

• [1] 提取关键词、生成 Embedding、语言检测（如 zh-CN）
• [2a] BM25：倒排索引 + jieba-wasm 分词，返回 Top-50
• [2b] Vector：cosine 相似度 + HNSW 索引，返回 Top-50
• [3] RRF 公式：score = 0.3/(k + rank_bm25) + 0.7/(k + rank_vec)，k=60
• [4] Cross-Encoder 对 RRF Top-K 候选重排序，最终排名以 Reranker 分数为准
• [5]final_score = fusion_score × retrievability
• [6] 返回 Top-K 记忆条目，含 L0 摘要 + 元数据
4.2 Embedding 模型选型
模型	维度	大小	速度	质量
text-embedding-3-small (OpenAI)	1536	API 调用	50-200ms (网络)	★★★★★
bge-small-en-v1.5 (本地 ONNX)	384	130MB (本地)	5-20ms (本地)	★★★★
bge-m3 (本地 ONNX, 多语言)	1024	2.2GB (本地)	20-80ms (本地)	★★★★★ (多语言)
默认策略：

• 有 OPENAI_API_KEY → text-embedding-3-small（最佳质量）
• 无 API Key → bge-small-en-v1.5（本地推理, 零成本）
• 多语言需求 → bge-m3（中英日韩全覆盖）
{
  "memory": {
    "embedding": {
      "provider": "openai",
      "model": "text-embedding-3-small",
      "localModel": "bge-small-en-v1.5",
      "dimensions": 1536,
      "batchSize": 100
    }
  }
}
API 限流与降级：

批量写入记忆时可能一次生成数十条 Embedding，需要处理 API 限流：

策略	说明
批量分片	batchSize（默认 100）控制单次 API 调用条数，超过则分片串行
指数退避	遇到 429 / 5xx 时，按 1s → 2s → 4s → 8s 退避重试，最多 3 次
本地 fallback	API 连续失败 ≥ 3 次 → 自动切换到 localModel（本地 ONNX），本次 Session 内不再尝试 API
延迟补齐	本地模型维度与 API 模型不同（384 vs 1536）→ 标记 embeddingPending: true，下次网络恢复时由 openclaw memory index --reembed 统一用 API 模型重新生成
4.3 索引实现
  ~/.openclaw/agents//memory/index/
  ├── bm25.idx            BM25 倒排索引 (JSON)
  ├── vector.idx           HNSW 向量索引 (二进制)
  ├── metadata.json        记忆元数据 (id, category, fsrs, ts)
  └── config.json          索引配置 (维度, 参数)

  BM25 倒排索引结构:
  {
    "vocab": { "部署": 0, "方案": 1, "typescript": 2, ... },
    "df": { "0": 15, "1": 8, "2": 42, ... },
    "postings": {
      "0": [{"id":"mem-001","tf":2}, {"id":"mem-015","tf":1}],
      "1": [{"id":"mem-001","tf":1}, {"id":"mem-023","tf":3}]
    },
    "totalDocs": 2847,
    "avgDocLength": 45
  }

  HNSW 向量索引:
  • 基于 hnswlib-node (C++ 绑定)
  • 参数: M=16, efConstruction=200, ef=100
  • 支持增量插入 (无需重建全量索引)
  • 内存占用: ~6KB/向量 (1536 维 × float32)
    384 维 (bge-small) → ~1.5KB/向量
  • 2847 条记忆 (1536 维) → ~18MB 索引

  文件索引方案 vs sqlite-vec 后端:
  ┌──────────────────┬────────────────────┬────────────────────┐
  │                  │ 文件索引 (默认)     │ sqlite-vec         │
  ├──────────────────┼────────────────────┼────────────────────┤
  │ 依赖             │ 零 (纯 JS/WASM)    │ sqlite-vec native  │
  │ BM25 调优        │ 完全可控           │ FTS5 内置          │
  │ 可观测性         │ cat 直接查看       │ 需 SQL 查询        │
  │ 原子性           │ WAL 自实现         │ SQLite 事务        │
  │ 10K+ 条性能      │ 开始变慢           │ 稳定               │
  │ 适用场景         │ 个人轻量使用       │ 大量记忆/多 Agent   │
  └──────────────────┴────────────────────┴────────────────────┘
  配置: { "memory": { "backend": "file" | "sqlite-vec" } }
4.4 索引一致性保障
BM25 和 HNSW 是两份独立索引，需确保与磁盘上的记忆记录保持一致：

  ┌──────────────────────────────────────────────────────────────┐
  │                 索引一致性机制                                  │
  │                                                               │
  │  [1] 写入时: 原子化三步写入                                   │
  │      ├─ WAL (Write-Ahead Log) 先记录写入意图                  │
  │      ├─ 写 records/{user|agent}/.json (源数据)            │
  │      ├─ 追加 BM25 posting                                     │
  │      └─ 追加 HNSW 向量                                        │
  │         写入失败时, 下次启动回放 WAL 补齐缺失索引条目          │
  │                                                               │
  │  [2] 启动时: 完整性校验                                       │
  │      ├─ 扫描 records/ 获取文件计数                             │
  │      ├─ 对比 metadata.json 中的 totalDocs                     │
  │      └─ 不一致 → 触发增量重建 (仅补齐差异部分)                │
  │                                                               │
  │  [3] 定期维护: openclaw memory index                          │
  │      ├─ 全量校验 BM25 / HNSW / metadata 三者一致              │
  │      └─ 需要重建时，执行重新索引流程                           │
  └──────────────────────────────────────────────────────────────┘
4.5 多语言全文搜索
v2026.2.22 新增:

语言	分词方案
中文	jieba-wasm (内置, 无外部依赖)
日文	TinySegmenter (内置)
韩文	音节切分 + 形态分析
英/西/葡	Snowball Stemmer
阿拉伯	ArabicStemmer
混合语言处理：

• 自动检测文本语言（franc 库）
• 同一查询可包含多语言关键词
• 每种语言独立分词后合并
• BM25 索引按语言分桶（避免跨语言干扰）
5. FSRS-6 遗忘算法
FSRS-6（Free Spaced Repetition Scheduler v6）借鉴自 Anki 记忆卡片系统。

5.1 核心思路: "软遗忘"
  传统遗忘 (硬删除):                 FSRS-6 (软遗忘):
  ┌────────────────────┐            ┌────────────────────┐
  │ 30天没访问 → 删除   │            │ 30天没访问 → 降级   │
  │                     │            │                     │
  │ 记忆消失了           │            │ 记忆还在，排名很低  │
  │ 永远找不回来         │            │ 如果再次被触发      │
  │                     │            │ → 优先级立刻回升    │
  │ 风险: 删掉关键信息   │            │ → "想起来"了        │
  └────────────────────┘            │                     │
                                    │ 安全: 不丢信息       │
                                    └────────────────────┘
5.2 算法机制
  每条记忆条目携带 FSRS 字段:

  ┌─────────────────────────────────────────────┐
  │ memory_record.fsrs = {                       │
  │   stability:    12.5,   // 记忆稳定性(天)    │
  │   difficulty:   0.3,    // 记忆难度 [0,1]    │
  │   lastReview:   "2026-02-20T10:00:00Z",     │
  │   nextReview:   "2026-03-04T22:00:00Z",     │
  │   reps:         5,      // 被访问次数        │
  │   lapses:       1       // 遗忘次数          │
  │ }                                            │
  └─────────────────────────────────────────────┘

  优先级计算:

  FSRS 定义 stability S = 记忆保持率降到 90% 所需的天数
  retrievability R(t) = 0.9^(t / S)

  • 刚被访问 (t≈0) → R ≈ 1.0 → 排名靠前
  • t = S 天后 → R = 0.9 → 仍在阈值上
  • t = 3S 天后 → R = 0.73 → 开始衰减
  • 长时间没访问 → R → 0 → 排名靠后（但不删除）
  • 被重新访问 → stability 增加 → 衰减变慢

  更新规则 (检索命中时):
  ┌────────────────────────────────────────────────┐
  │ [1] reps += 1                                  │
  │ [2] stability = stability × (1 + factor)       │
  │     factor 取决于 difficulty、elapsed、R(t)     │
  │ [3] difficulty 微调 (根据检索排名)              │
  │ [4] lastReview = now                           │
  │ [5] nextReview = now + new_stability           │
  │     即: 以更新后的 stability 为间隔安排下次复习 │
  │     例: stability=12.5d → 12.5 天后 R 降至 90% │
  └────────────────────────────────────────────────┘
5.3 与 Generative Agents 的三维评分对比
OpenClawRRF(BM25, Vec) × retrievability自适应 · stability 自动学习Generative Agentsα·Recency + β·Importance + γ·Relevance权重手动调 · 无学习机制

维度映射对比：

维度	Generative Agents	OpenClaw
Recency	α 权重手动调	FSRS 时间衰减（自适应）
Importance	β 权重手动调	stability（从访问模式学习）
Relevance	γ 权重手动调	BM25 + Vector 检索分
5.4 记忆注入 Context 的格式
检索命中的记忆条目在 Context 组装阶段（见 02-agent-runtime.md §6.2 步骤 3）被格式化为 Markdown 块，拼接在 System Prompt 尾部：

  注入模板:

  ## 关于此用户的记忆
  以下是你过去与此用户交互中积累的记忆，按相关性排序：

  - [偏好, 记于 2026-02-15] 用户偏好 TypeScript，不喜欢 Java
  - [档案, 记于 2026-01-20] 前端工程师，32 岁，在杭州
  - [洞察, 记于 2026-02-28] 用户对视觉体验要求高，倾向简洁暗色设计
  - [事件, 记于 2026-02-14] 用户提交了 PR #342，修复了登录 bug

  格式规则:
  • 每条 = [category, 记于 createdAt] + L0 摘要
  • 高相关性条目自动展开为 L1（~500 tokens）
  • 洞察条目（insight）排在同分事实条目之前
  • 带时间戳 → 让模型自行判断时效性（见去重陷阱 4）
  • 总 Token 预算由 memoryMaxTokens 控制（默认 3000）
6. 记忆写入流程
6.1 自动提取
Agent Loop 结束后异步触发。为避免高频对话产生冗余提取，实际有两层限流：(1) 连续 Agent Loop 间隔 < 30s 时合并为一次提取；(2) 同一 Session 每小时最多触发 10 次提取。

取消/超时闲聊 < 3 条正常完成是否< 0.70.7~0.92重复矛盾/补充> 0.92no-merge其他策略本轮对话[1] 过滤跳过跳过[2] LLM 提取[3] 分类[4] 确定性去重hash 匹配?跳过语义去重cosine 相似度?新条目[4b] LLM 判断跳过[4c] 合并策略?跳过合并更新[5] 生成 Embedding[6] 持久化写入

各步骤说明：

• [2] LLM 提取：用轻量模型提取 facts / preferences / events / lessons，~500-1000 tokens
• [3] 分类：facts → profile / event，preferences → preference，lessons → lesson
• [4] 确定性去重：hash(normalized(L0)) 完全匹配则跳过
• 语义去重三区间：< 0.7 新条目 / 0.7-0.92 灰区走 LLM 判断 / > 0.92 近似重复
• [4c] 合并策略：no-merge（event/case）跳过；overwrite / latest-wins / append 合并
• [5] Embedding：L0 → Embedding 模型 → Float32Array，批量处理
• [6] 持久化：写 records/ 文件 + 更新 BM25 / HNSW 索引 + metadata
错误处理与降级：

提取流程中任一步骤失败时的降级策略：

失败点	现象	降级策略
LLM 提取超时/5xx	模型无响应或返回错误	重试 1 次（指数退避 2s → 4s）；仍失败则跳过本轮，下次 Agent Loop 合并重试
LLM 返回空/格式异常	JSON 解析失败或字段缺失	记录 warn 日志 + 跳过；不写入脏数据
Embedding 生成失败	API 限流或本地 ONNX 崩溃	API 失败 → 自动降级到本地 ONNX 模型；ONNX 也失败 → 仅写入记录文件，Embedding 标记 pending，下次 openclaw memory index 补齐
持久化写入失败	磁盘满或权限错误	WAL 已记录意图 → 下次启动回放补齐；磁盘满则 emit memory:error 事件通知上层
去重 LLM 判断失败	灰区 LLM 调用超时	降级为保守策略：cosine > 0.85 视为重复跳过，≤ 0.85 视为新条目写入
6.2 去重陷阱
陷阱 1：重复判为矛盾 (Mem0 #1674)
• 存："我喜欢咖啡" → 再说："我喜欢咖啡"
• 预期 NOOP，实际 LLM 判为"矛盾" → DELETE → 偏好丢失
• 防御：先用确定性去重（hash + cosine），LLM 只在 cosine 0.7-0.92 灰区介入


陷阱 2：First Write Wins (cognee #1831)
• 存："张三是工程师" → 更新："张三升了经理"
• 预期合并更新，实际新属性被静默丢弃
• 防御：profile 类用 overwrite 策略，新值总是覆盖旧值


陷阱 3：语义扭曲
• 用户说："我讨厌西兰花" → LLM 重述："用户喜欢蔬菜"
• 记忆不是丢了，是被扭曲了
• 防御：L2 始终保留原文；L0 摘要仅用于索引，不用于回忆；模型回忆时优先引用 L1/L2


陷阱 4：时间混淆
• 用户说："我上周开始学 Rust" → 提取："用户在学 Rust"
• 3 个月后检索："用户在学 Rust" → 仍在学？
• 防御：记忆条目始终带 createdAt 时间戳，Context 注入时显示 "记于 2026-02-01"
7. 反思机制
定期对累积的事实记忆进行反思,提炼高层洞察:

反思触发条件：

1. 累积到 MEMORY_REFLECTION_THRESHOLD（50）条未反思的新记忆
2. 定时触发（每 24 小时）
3. 手动触发：通过管理端触发反思任务
两层结构洞察层 (高优先级)事实层 (正常优先级)触发条件≥ 50 条未反思每 24h 定时手动触发[1] 按类型分组[2] LLM 反思[3] 存入洞察层[4] 标记已反思

各步骤说明：

• [1] 分组：按 profile / event / preference 等类型分组
• [2] 反思：每组独立调用 LLM，提炼高层洞察（最多 5 条），含置信度 + 支撑证据
• [3] 存储：category: insight，mergeStrategy: latest-wins
• [4] 标记：原始记忆 FSRS priority 降低，洞察获得更高初始 stability
两层结构示例：

• 洞察层：张三是项目核心贡献者，提交频率约每周 2 次 / 用户对视觉体验要求高，倾向简洁暗色设计
• 事实层：2/14 张三提交了 PR #342 / 用户说他更喜欢暗色主题
洞察如何反哺检索：

  ┌──────────────────────────────────────────────────────────┐
  │  [1] 初始 stability 加成                                  │
  │      洞察条目 stability = 原始条目平均 stability × 3      │
  │      → 衰减更慢，在检索结果中长期保持高排名               │
  │                                                           │
  │  [2] 原始条目 FSRS 降权                                   │
  │      已被反思的事实条目 stability × 0.5                    │
  │      → 检索时优先返回洞察而非零散事实                      │
  │      → 但原始条目不删除，L2 原文可追溯                    │
  │                                                           │
  │  [3] Context 注入排序                                     │
  │      同分时 insight 类型排在 event/preference 之前        │
  │      → 模型优先看到高层结论，再看细节                     │
  │                                                           │
  │  [4] 洞察的自我迭代                                       │
  │      下一轮反思可能产生更新的洞察 (latest-wins 合并)       │
  │      旧洞察被新洞察覆盖，避免洞察层膨胀                   │
  └──────────────────────────────────────────────────────────┘
8. 跨 Agent 记忆
默认每个 Agent 有独立的 Memory（agents/main/memory/、agents/coding/memory/）。问题：用户在 "main" 说过的偏好，"coding" Agent 不知道。

coding Agent Memorylesson / pattern / casemain Agent Memorylesson / pattern / case共享 User Memoryprofilepreferenceevent检索时合并共享记忆优先

存储路径：

• 共享层：agents/_shared/memory/user/，所有 Agent 共同读写
• 独立层：agents//memory/agent/，每个 Agent 私有
• 检索合并：sharedMemory.retrieve + agentMemory.retrieve，去重时共享记忆优先
配置：{ "memory": { "shareUserMemory": true } }

9. 记忆索引与迁移
  ┌──────────────────────────────────────────────────────┐
  │             记忆导入/导出                               │
  │                                                       │
  │  迁移前建议:                                           │
  │  1) 备份 ~/.openclaw/agents//memory/           │
  │  2) 迁移后执行 openclaw memory index                  │
  │                                                       │
  │  典型记录格式:                                         │
  │  {                                                    │
  │    "version": "1.0",                                 │
  │    "agent": "main",                                  │
  │    "exportedAt": "2026-02-26T10:00:00Z",             │
  │    "records": [                                       │
  │      {                                                │
  │        "id": "mem-001",                              │
  │        "category": "preference",                     │
  │        "content": { "l0": "...", "l1": "...", "l2": "..." },│
  │        "fsrs": { ... },                              │
  │        "createdAt": "..."                            │
  │      },                                               │
  │      ...                                              │
  │    ]                                                  │
  │  }                                                    │
  │                                                       │
  │  迁移后处理:                                           │
  │  → 去重: 按 id 跳过已存在的记忆                      │
  │  → 重建 Embedding (模型可能不同 → 维度不兼容)       │
  │  → 重建 BM25 + HNSW 索引                            │
  │  → FSRS 字段原样保留 (不重置)                       │
  │                                                       │
  │  用途:                                                │
  │  • 迁移到新机器                                       │
  │  • 在多台设备间同步记忆                               │
  │  • 备份/恢复                                          │
  │  • 从旧版本升级 (version 字段做格式兼容)             │
  │                                                       │
  │  注意事项:                                             │
  │  • Embedding 模型变更 → 必须全量重建向量索引          │
  │    (bge-small 384 维 ↔ openai 1536 维 不兼容)       │
  │  • 导出文件不含 embedding 字段 (体积原因)            │
  │    → 导入时自动重新生成                               │
  │  • 共享 User Memory 和 Agent Memory 分开导出/导入   │
  │  • Session 历史 (messages.jsonl) 不在此导出范围内    │
  │    → 用 cp -r sessions/ 直接复制                     │
  └──────────────────────────────────────────────────────┘
格式版本升级路径：

导出文件的 version 字段用于处理跨版本兼容。升级规则：

版本变更	触发条件	迁移行为
1.0 → 1.x（小版本）	新增可选字段（如 tags、source）	向后兼容，导入时缺失字段填默认值
1.x → 2.0（大版本）	Schema 结构变更（如 content 从 string 改为 {l0, l1, l2} 对象）	需迁移脚本：openclaw memory migrate --from 1.x --to 2.0
Embedding 模型变更	配置中 embedding.model 与导出时不同	丢弃旧 Embedding，全量重建：openclaw memory index --reembed
自动升级流程：

1. 导入时读取 version 字段，与当前运行版本比较
2. 小版本差异 → 自动补齐缺失字段，静默完成
3. 大版本差异 → 拒绝导入，提示用户先运行 openclaw memory migrate
4. 迁移脚本保留原文件备份（*.bak），可回滚
10. 存储位置
  ~/.openclaw/agents//
  ├── sessions/
  │   ├── s-abc123/
  │   │   ├── meta.json          Session 元数据
  │   │   ├── messages.jsonl     消息历史 (JSONL)
  │   │   └── context.json       修剪后上下文快照
  │   └── s-def456/
  │       └── ...
  └── memory/
      ├── index/                 检索索引 (文件后端 / sqlite-vec)
      │   ├── bm25.idx           BM25 倒排索引
      │   ├── vector.idx         HNSW 向量索引
      │   ├── metadata.json      记忆元数据
      │   └── config.json        索引配置
      ├── records/               记忆条目原文
      │   ├── user/              User Memory (可配置共享)
      │   │   ├── mem-001.json
      │   │   └── ...
      │   └── agent/             Agent Memory (独立)
      │       ├── mem-100.json
      │       └── ...
      └── reflections/           反思洞察
          └── insights.json

  共享 User Memory (如果启用):
  ~/.openclaw/agents/_shared/memory/user/
  ├── index/
  └── records/
11. 性能特征
测试环境参考：M2 MacBook Pro / Node.js 22 / SSD / ~3K 条记忆 / text-embedding-3-small。实际数值因硬件和记忆规模而异。
指标	实测值 (参考)
Session 查找 (内存 Map)	< 0.1ms
Session 加载 (磁盘, 50条消息)	50-150ms
Session 持久化 (追加写)	5-20ms
Memory 检索 (混合, Top-10, 含 Reranking)	200-500ms
Memory 检索 (混合, Top-10, 无 Reranking)	50-150ms
Embedding 生成 (API, 单条)	50-200ms
Embedding 生成 (本地 ONNX, 单条)	5-20ms
HNSW 插入 (单条)	< 5ms
BM25 索引更新	< 10ms
记忆提取 (LLM, 异步)	2-5s
反思 (LLM, 50条记忆)	5-15s
单 Agent 记忆容量	100,000+ 条
向量索引内存占用 (10K条, 1536维)	~60MB
向量索引内存占用 (10K条, 384维)	~4MB
BM25 索引大小 (10K条)	~2MB
12. 隐私与数据安全
记忆系统存储高度敏感的用户信息（偏好、事件、档案），安全设计直接影响用户信任。

  ┌──────────────────────────────────────────────────────────┐
  │  [1] 存储安全                                             │
  │  • 所有数据存在用户本地 (~/.openclaw/)，不上传云端       │
  │  • 文件权限: 目录 700, 文件 600 (仅 owner 可读写)       │
  │  • 加密: 当前版本明文存储; 规划中支持 AES-256-GCM       │
  │    静态加密，密钥由用户 passphrase 派生                   │
  │                                                           │
  │  [2] 数据删除                                             │
  │  • openclaw memory delete                             │
  │    → 删除 records/ 文件 + 从 BM25/HNSW 索引中移除       │
  │  • openclaw memory purge --user                   │
  │    → 批量删除某用户的所有记忆（"被遗忘权"）              │
  │  • 删除后: 索引标记 tombstone，下次 index 时物理清除     │
  │                                                           │
  │  [3] Embedding 隐私                                       │
  │  • 使用 OpenAI API 生成 Embedding 时，L0 摘要会发送到   │
  │    外部服务器（已在 L0 层做脱敏/摘要化）                 │
  │  • 本地 ONNX 模型: 零数据外泄                            │
  │  • 配置建议: 高敏感场景使用本地 Embedding 模型            │
  │                                                           │
  │  [4] LLM 提取隐私                                        │
  │  • 记忆提取和反思需调用 LLM，对话片段会发送到模型        │
  │  • 缓解: 使用本地模型 (Ollama) 做提取; 或配置            │
  │    memory.extractModel 使用低成本小模型减少暴露面        │
  └──────────────────────────────────────────────────────────┘
