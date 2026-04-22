# UseCases | 案例合集

> Enterprise Agent deployment case studies | 企业级 Agent 落地案例

---

## 简介

这里收录了 **AuraMind** 企业级 Agent 落地的实际案例，每个案例都是一个完整的 SaaS 应用通过 Agent 改造的实践。

## 案例列表

### 1. 🔧 CRM Agent — 客户管理系统 Agent 化

**功能**：将传统 CRM 系统改造为 Agent 服务，通过自然语言管理客户数据

**包含内容**：
- CRM 核心技能的 Agent 实现
- 自然语言查询客户
- 自动建档与跟进提醒

**使用方法**：

```bash
# 安装 skill 后即可使用
/install crm-skill-test

# 安装完成后访问：http://your-agent-platform/crm
```

---

### 2. 🏥 PatientSKill4NY — 预约系统 Agent 化

**功能**：医疗预约系统的 Agent 改造，实现智能预约管理

**包含内容**：
- 预约管理核心技能
- 患者档案管理
- 智能排班与冲突检测

**使用方法**：

```bash
# 安装 skill 后即可使用
/install PatientSKill4NY

# 安装完成后访问：http://your-agent-platform/patient
```

---

## 共同特点

每个案例都具备：

1. ✅ **开箱即用** - 安装 skill 后即可访问对应的 SaaS 平台
2. 🛡️ **数据隔离** - 已集成 AMK 存储权限隔离
3. 🔌 **标准化接口** - 符合 AuraMind Agent 规范

---

## 如何使用

1. **克隆本仓库**：
```bash
git clone https://github.com/lingling1989r/AuraMind_Agent_As_Service.git
```

2. **进入对应案例目录**，查看详细 README

3. **安装到你的 Agent 平台**：
```bash
# 方式一：直接复制 skill files 到你的平台
cp -r UseCases/[案例名] /path/to/your-agent/skills/

# 方式二：按照各案例的安装说明操作
```

---

## 添加新案例

欢迎提交案例！请按以下格式：

```
UseCases/
└── [你的案例名]/
    ├── README.md      ← 必须，包含安装和使用说明
    ├── skill.json   ← skill 定义文件
    └── files/      ← 技能文件
```

---

## License

MIT License