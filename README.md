# AuraMind Agent As Service 🛠️

> 把 OpenClaw 从"私人助理"变成可服务多个企业的多租户 SaaS 平台 | OpenClaw Multi-Tenant Isolation Plugin

[![Star on GitHub](https://img.shields.io/github/stars/lingling1989r/AuraMind_Agent_As_Service?style=social)](https://github.com/lingling1989r/AuraMind_Agent_As_Service)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![npm package](https://img.shields.io/badge/npm-openclaw--amk-brightgreen)](https://www.npmjs.com/package/openclaw-amk)

[![GitHub stars](https://img.shields.io/github/stars/lingling1989r/AuraMind_Agent_As_Service?style=flat-square)](https://github.com/lingling1989r/AuraMind_Agent_As_Service)
[![GitHub forks](https://img.shields.io/github/forks/lingling1989r/AuraMind_Agent_As_Service?style=flat-square)](https://github.com/lingling1989r/AuraMind_Agent_As_Service)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/lingling1989r/AuraMind_Agent_As_Service/blob/main/LICENSE)
[![English](https://img.shields.io/badge/README-English-brightgreen?style=flat-square)](README_en.md)

---

## Introduction | 简介

Welcome to **AuraMind Agent As Service** — the hub for enterprise-grade Agent tools and use cases.

**AuraMind** 当前重点聚焦在把 OpenClaw 安全包装成可服务多个真实用户的企业级 SaaS Agent 能力：

- **Multi-tenant isolation** — 多租户文件、记忆、权限边界隔离
- **Enterprise deployment** — 企业级 Agent 落地与接入实践
- **Production use cases** — 面向真实业务场景的案例沉淀

---

## Directory Structure | 目录结构

```
AuraMind_Agent_As_Service/
├── AgentTools/   # Agent 工具集
│   └── amk/      # OpenClaw AMK 多租户隔离插件
└── UseCases/     # 业务案例
```

---

## AgentTools | 工具

### 🛡️ AMK — Storage & Permission Isolation Plugin

**AMK** (Agent Memory & Knowledge) is a storage isolation plugin that solves a critical challenge in multi-tenant Agent services:

> **Problem**: When you package an Agent as a SaaS service for multiple users, there's no built-in permission control or physical storage isolation by default!

AMK provides:
- 🔐 **Native Permission + Physical Isolation**: Each Agent gets its own workspace
- ⚡ **Lightweight & Easy Integration**: Drop-in plugin for your Agent project
- 🎯 **MCP-Ready**: Solves pipeline security issues when anyone can extend Agent capabilities

**Use Cases**:
- Multi-tenant SaaS Agent services
- Enterprise Agent deployment with data isolation
- MCP ecosystem security

---

## UseCases | 案例

### 案例一：飞书多用户 AI 助手服务

**场景**：某 SaaS 平台在飞书里嵌入 OpenClaw Agent，为数十家企业用户提供 AI 服务。

**问题**：没有存储隔离时，A 用户发来的合同文件、对话记忆和权限范围可能被 B 用户访问到。

**方案**：接入 AMK 插件，为每个用户分配独立 workspace，并隔离文件、memory namespace、profile/prove 与 transcript。

**效果**：通过数据隔离审计，顺利上线企业版。

---

### 案例二：AI 问诊平台多租户隔离

**场景**：医疗科技公司用 OpenClaw Agent 做在线问诊，每次问诊需要读取用户病历和证明材料。

**问题**：患者隐私数据必须物理隔离，不同患者之间不能互相访问数据。

**方案**：AMK 按 user scope 路由文件到独立目录，并将 memory namespace 与 transcript 完全隔离。

**效果**：满足合规要求，正式投入生产环境使用。

---

## Getting Started | 快速开始

### Clone the Repository

```bash
git clone https://github.com/lingling1989r/AuraMind_Agent_As_Service.git
cd AuraMind_Agent_As_Service
```

### Use AMK

See [`AgentTools/amk/README.md`](AgentTools/amk/README.md) for integration instructions.

---

## Roadmap | 规划

- [ ] Multi-language README support
- [ ] More AgentTools
- [ ] Enterprise Agent deployment case studies
- [ ]扩展更多权限管控能力

---

## Contributing | 贡献

🎉 Contributions are welcome!

- 🐛 Found a bug? Create an **Issue**
- 💡 Have a feature request? Create an **Issue**
- 🔧 Want to contribute code? **Fork** and submit a **PR**

---

## Contact | 联系

- 📧 Email: lingling1989r@gmail.com
- 💬 WeChat: `aoxueluoluo` (备注 "github")

---

## License | 许可证

MIT License

---

⭐ **Star** this repo to stay updated!