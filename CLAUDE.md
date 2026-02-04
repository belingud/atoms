# Atoms - AI 多Agent协作开发平台

## 项目概述

Atoms 是一个基于 Web 的 AI 辅助开发平台，用户可以通过对话让 AI 生成、修改代码，并在浏览器内实时预览运行结果。支持多 Agent 协作，不同角色（工程师、架构师、产品经理等）通过 @mention 调度。

## 技术栈

- **框架**: Next.js 16 (App Router) + React 19 + TypeScript 5
- **样式**: Tailwind CSS 4 + shadcn/ui (Radix UI)
- **状态管理**: Zustand 5
- **数据库/认证**: Supabase (PostgreSQL + RLS + OAuth)
- **AI**: OpenAI API (兼容任意 OpenAI 格式的 API)
- **编辑器**: Monaco Editor
- **终端**: XTerm.js
- **容器**: WebContainer API (浏览器内 Node.js 运行时)
- **包管理**: pnpm
- **图标**: Lucide React

## 常用命令

```bash
pnpm dev          # 启动开发服务器
pnpm build        # 生产构建
pnpm lint         # ESLint 检查
pnpm tsc --noEmit # TypeScript 类型检查
```

## 环境变量

```
NEXT_PUBLIC_SUPABASE_URL      # Supabase 项目 URL
NEXT_PUBLIC_SUPABASE_ANON_KEY # Supabase 匿名 Key
OPENAI_API_KEY                # OpenAI API Key (服务端)
OPENAI_BASE_URL               # API 地址，默认 https://api.openai.com/v1
OPENAI_MODEL                  # 主模型，默认 gpt-4o
OPENAI_SMALL_MODEL            # 小模型，默认 gpt-4o-mini
NEXT_PUBLIC_APP_URL           # 应用 URL (OAuth 回调)
```

## 项目结构

```
src/
├── app/
│   ├── api/
│   │   ├── chat/route.ts          # AI 对话 API (支持多Agent路由)
│   │   ├── agent/route.ts         # Agent 委派 API (团队领导用)
│   │   ├── auth/callback/route.ts # OAuth 回调
│   │   └── generate-name/route.ts # 项目名称生成
│   ├── login/page.tsx             # 登录页
│   ├── page.tsx                   # 主页
│   └── layout.tsx                 # 根布局
├── components/
│   ├── chat/
│   │   ├── chat-panel.tsx         # 对话面板 (含@mention自动完成)
│   │   ├── message.tsx            # 消息展示 (含Agent徽章)
│   │   ├── agent-badge.tsx        # Agent 头像/徽章组件
│   │   └── mention-autocomplete.tsx # @mention 下拉选择
│   ├── layout/
│   │   ├── app-layout.tsx         # 三栏布局 (侧边栏+聊天+预览)
│   │   └── main-app.tsx           # 应用协调器
│   ├── preview/
│   │   ├── preview-panel.tsx      # 预览面板 (编辑器+终端+浏览器)
│   │   ├── code-editor.tsx        # Monaco 代码编辑器
│   │   ├── file-tree.tsx          # 文件树
│   │   ├── browser-preview.tsx    # iframe 浏览器预览
│   │   └── terminal.tsx           # XTerm 终端
│   ├── sidebar/
│   │   └── project-sidebar.tsx    # 项目列表侧边栏
│   ├── ui/                        # shadcn/ui 基础组件
│   └── welcome-page.tsx           # 欢迎页
├── lib/
│   ├── agents/
│   │   └── config.ts              # 6个Agent定义 (systemPrompt/tools/颜色)
│   ├── store/
│   │   ├── chat-store.ts          # 对话状态 (消息/工具调用/Agent委派)
│   │   ├── project-store.ts       # 项目 CRUD
│   │   ├── preview-store.ts       # 文件管理/WebContainer/终端
│   │   ├── auth-store.ts          # 用户认证状态
│   │   └── agent-store.ts         # 当前Agent状态
│   ├── supabase/
│   │   ├── client.ts              # 浏览器端 Supabase 客户端
│   │   ├── server.ts              # 服务端 Supabase 客户端
│   │   └── middleware.ts          # 认证中间件
│   ├── types/
│   │   ├── database.ts            # Supabase 数据库类型 (projects/messages/files)
│   │   └── agent.ts               # Agent 类型定义
│   ├── utils/
│   │   └── mention-parser.ts      # @mention 解析 (中英文名/别名)
│   ├── webcontainer/
│   │   └── index.ts               # WebContainer 启动和管理
│   └── utils.ts                   # 工具函数 (cn)
├── middleware.ts                   # Next.js 认证中间件
supabase/
└── migrations/
    ├── 001_initial.sql             # 初始表结构 (projects/messages/files + RLS)
    ├── 002_add_message_policies.sql
    └── 003_add_agent_to_messages.sql # messages 表添加 agent_id
```

## 核心架构

### 数据库 (Supabase)

三张表，均有 RLS 行级安全策略：

- **projects**: 用户项目 (id, user_id, name, timestamps)
- **messages**: 对话消息 (id, project_id, role, content, agent_id, created_at)
- **files**: 项目文件 (id, project_id, path, content, timestamps)

### 状态管理 (Zustand)

所有 Store 使用 `create<State>((set, get) => ({...}))` 模式：

- **chat-store**: 最复杂，管理消息流、AI 对话循环、工具执行、Agent 委派
- **preview-store**: 文件管理、WebContainer 状态、终端输出、命令队列
- **project-store**: 项目 CRUD、活动项目选择
- **auth-store**: 用户认证状态
- **agent-store**: 当前选中的 Agent

### AI 对话流程

```
用户输入 → parseMentions() 解析@Agent
    ↓
sendMessage() → 对话循环 (最多40轮)
    ↓
POST /api/chat { messages, projectId, agentId }
    ↓
加载 Agent 的 systemPrompt + 工具列表
    ↓
OpenAI Streaming → 文本 + <!--TOOL_CALLS:JSON-->
    ↓
客户端解析工具调用 → 执行 → 结果注入对话继续
```

### 工具系统

6个基础工具 + 1个委派工具：

| 工具             | 说明                              |
| ---------------- | --------------------------------- |
| `write_file`     | 写入/更新项目文件                 |
| `read_file`      | 读取文件内容                      |
| `list_directory` | 列出目录                          |
| `search_files`   | 搜索文件                          |
| `run_command`    | 执行命令 (非 npm install)         |
| `run_preview`    | 启动预览 (自动 npm install + dev) |
| `delegate_task`  | 团队领导专用，委派任务给其他Agent |

工具调用通过 HTML 注释标记嵌入流式响应：`<!--TOOL_CALLS:[JSON]-->`

### 多Agent系统

6个Agent角色，通过 @mention 选择：

| Agent      | ID          | 默认   | 专属工具             |
| ---------- | ----------- | ------ | -------------------- |
| 团队领导   | `leader`    | 否     | 全部 + delegate_task |
| 产品经理   | `pm`        | 否     | 文件读写             |
| **工程师** | `engineer`  | **是** | 全部代码工具         |
| 架构师     | `architect` | 否     | 只读                 |
| 数据分析师 | `analyst`   | 否     | 文件读写 + 命令      |
| SEO专家    | `seo`       | 否     | 文件读写             |

**委派流程**: 团队领导使用 `delegate_task` → 被委派 Agent 以独立对话出现 → 执行完整工具循环（写文件/运行预览等）

**@mention 支持**: 中文名(`@工程师`)、英文名(`@engineer`)、别名(`@开发`)

**无项目启动**: 没有活动项目时也可输入 @mention 和消息，发送后自动创建项目（名称由 AI 生成）

## 关键约定

### 代码风格
- 中文 UI 文案 (按钮、提示、标签)
- 英文代码注释和变量名
- 组件按功能分目录 (chat/, preview/, layout/, ui/)
- Store 方法名用动词 (fetch, send, delete, clear)

### 工具调用协议
- AI 响应中嵌入 `<!--TOOL_CALLS:[{id, name, arguments}]-->` 标记
- 客户端解析后逐个执行，结果作为 user 消息回传 AI 继续对话
- 工具状态跟踪: pending → running → completed/error

### 数据库操作
- 通过 Supabase 客户端，遵循 RLS 策略
- UUID 主键，级联删除 (项目删除 → 消息/文件级联)
- Message 的 agent_id 记录响应来自哪个 Agent
