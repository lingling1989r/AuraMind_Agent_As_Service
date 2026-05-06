# OpenClaw AMK — Multi-Tenant Storage & Permission Isolation Plugin

> Solve data isolation when packaging OpenClaw as a SaaS service for multiple users.

[![GitHub stars](https://img.shields.io/github/stars/lingling1989r/AuraMind_Agent_As_Service?style=flat-square)](https://github.com/lingling1989r/AuraMind_Agent_As_Service)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/lingling1989r/AuraMind_Agent_As_Service/blob/main/LICENSE)

---

## What it is

OpenClaw AMK is a multi-tenant storage and permission isolation plugin for OpenClaw.

Its goal is simple: turn OpenClaw from a personal assistant into a production-ready runtime layer that can safely serve multiple real users inside the same SaaS product.

---

## The problem

When OpenClaw is exposed to multiple external users, three core risks appear quickly:

- Memory leakage — one user's profile, history, or materials may leak into another user's conversation
- Storage overlap — uploaded files and generated artifacts may end up in shared or incorrect directories
- Permission bypass — file-related actions may cross the current user's workspace boundary

If these problems are not solved, OpenClaw is better suited for personal use than for a multi-user enterprise service.

---

## The solution

OpenClaw AMK adds a minimum viable isolation layer for real deployments:

- Per-user workspace isolation
- Permission boundary enforcement for file access
- Memory namespace isolation
- Isolated transcript routing
- Scoped profile and proof records

This helps the host application route files, memory, profile/prove, and transcripts into the current user's scope instead of a shared global runtime.

---

## Quick start

### Install

```bash
npm install
npm pack
openclaw plugins install /absolute/path/to/openclaw-amk-0.1.0.tgz
openclaw config validate
openclaw gateway restart
```

### Load as the active memory plugin

Bind `plugins.slots.memory` to `openclaw-amk` in your OpenClaw config, then restart the gateway.

For full integration details, see `AgentTools/amk/README.md`.

---

## Typical use cases

### Feishu multi-user AI assistant

A SaaS team embeds an OpenClaw Agent into Feishu and serves dozens of enterprise users.

AMK prevents one tenant's files, memory, and permissions from being exposed to another tenant.

### AI medical consultation platform

A health-tech team uses OpenClaw for online consultation workflows that read medical records and supporting documents.

AMK isolates patient data by user scope so records, transcripts, and file access remain separated for compliance.

---

## Repository structure

```text
AuraMind_Agent_As_Service/
├── AgentTools/
│   └── amk/
└── UseCases/
```

---

## License

MIT License
