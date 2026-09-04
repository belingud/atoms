# Atoms · AI 多 Agent 协作开发平台

> 把想法变成产品 —— 通过对话让多个 AI Agent 分工协作，为你生成、修改代码，并在浏览器里实时预览运行结果。

Atoms 是一个基于 Web 的 AI 辅助开发平台。你可以像和团队成员聊天一样描述需求，通过 `@mention` 调度不同角色的 Agent（团队领导、产品经理、工程师、数据分析师、SEO 专家），由它们完成需求分析、代码编写、预览运行与迭代优化，全程无需离开浏览器。

## ✨ 核心特性

- **🤖 多 Agent 团队协作**：5 个专业角色，支持 `@mention`（中文名 / 英文名 / 别名）路由与团队领导的任务委派编排
- **🖥️ 浏览器内实时预览**：基于 [WebContainer](https://webcontainers.io/) 在浏览器中安装依赖并运行 Node.js 应用，配合 Monaco 编辑器、文件树、XTerm 终端
- **💬 原生 AI 对话循环**：流式输出 + 工具调用自动执行（读写文件、运行命令、启动预览），Agent 自主迭代直至任务完成
- **👥 领导委派编排**：团队领导自动拆解任务 → 委派多个专家 Agent → 收集结果继续汇报，最多支持 5 轮委派
- **📸 版本快照**：每次修改文件的任务自动生成项目快照，可在历史版本间随时回滚
- **🔐 多用户与数据持久化**：Supabase（Google OAuth + RLS）持久化项目、对话、文件与版本历史，数据按用户隔离
- **🧠 兼容任意 OpenAI 格式 API**：可自由切换 OpenAI / DeepSeek / Moonshot 等模型服务
- **🚀 零门槛启动**：无需预先创建项目，直接在欢迎页输入想法，AI 自动生成项目名并开启第一个任务

## 多 Agent 系统

通过 `@名字` 在输入框中选择 Agent，支持中文名、英文名与别名（如 `@工程师` / `@engineer` / `@开发`）。

| Agent | ID | 默认 | 职责 | 可用工具 |
| --- | --- | :-: | --- | --- |
| 团队领导 | `leader` | | 复杂任务协调者，拆解任务并委派给专家 | 全部文件/命令工具 + `delegate_task` |
| 产品经理 | `pm` | | 需求分析、用户故事、产品规划（不写代码） | 只读：`read_file` / `list_directory` / `search_files` |
| **工程师** | `engineer` | ✅ | 全栈代码实现、调试（默认角色） | 全部文件 + `run_command` + `run_preview` |
| 数据分析师 | `analyst` | | 数据处理、可视化与图表组件 | 文件读写 + `run_command` |
| SEO 专家 | `seo` | | SEO 优化、meta 标签、性能与可访问性建议 | 文件读写 |

> 消息中未包含 `@mention` 时，沿用当前对话的 Agent（会话恢复时取历史最后一位），新会话默认工程师。

### 委派编排流程

团队领导不直接写代码，而是调用 `delegate_task` 把任务分派出去：

```
用户 @团队领导 构建一个电商网站
    ↓ 领导拆解任务，依次委派
delegate_task(pm)      → 产品经理输出功能需求/用户故事
delegate_task(engineer)→ 工程师拿到需求文档，完整执行工具循环（写文件/起预览）
delegate_task(seo)     → SEO 专家优化 meta 与性能
    ↓ 结果回收
领导汇总各 Agent 报告 → 继续委派或输出最终方案
```

被委派的 Agent 以独立的完整对话执行任务（含各自的工具集），执行结果自动回传给领导，直到任务收敛或达到 5 轮委派上限。

## 工具系统

工具定义在服务端 `/api/chat`，实际执行在浏览器端，每种 Agent 只能调用自己清单内的工具：

| 工具 | 说明 |
| --- | --- |
| `write_file` | 新建或整体重写文件 |
| `update_file` | 按内容定位精确修改文件片段 |
| `read_file` | 读取文件内容 |
| `delete_file` | 删除文件 |
| `list_directory` | 递归列出目录（支持深度控制） |
| `search_files` | 按文件名模式搜索 |
| `run_command` | 执行 shell 命令（如 `npm run build`，禁止用于 `npm install`） |
| `run_preview` | 启动/重启预览：自动执行 `npm install` + 启动开发服务 |
| `delegate_task` | （仅团队领导）委派任务给其他 Agent |

## 工作流程

Agent 自主迭代的对话循环（在客户端完成）：

```
用户输入
  → parseMentions() 解析 @Agent（未提及则沿用当前 Agent）
  → POST /api/chat（服务端注入该 Agent 的 systemPrompt + 工具定义）
  → OpenAI 流式输出文本 / 工具调用（<!--TOOL_CALLS:[...]--> 标记内嵌于流）
  → 客户端解析标记 → 顺序执行工具（写文件/命令/预览…）→ 结果回填对话
  → 继续请求，直到无工具调用、单 Agent 超过 100 轮或被用户中断
  → 若发生过文件修改，自动创建一次版本快照
```

- 流式内容同时支持 `<think>…</think>`（DeepSeek 风格）思考过程标记，可在消息卡片中展开查看
- 文件写入后立即持久化到 Supabase `files` 表；启动预览时整棵文件树会被挂载（mount）进 WebContainer 并自动 `npm install` + 启动开发服务

## 快速开始

### 环境要求

- Node.js ≥ 20（推荐 22+）
- [pnpm](https://pnpm.io/)
- 一个 [Supabase](https://supabase.com/) 项目（用于认证与数据库）
- 任意 OpenAI 兼容的 API Key

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

```bash
cp .env.example .env.local
```

| 变量 | 必填 | 说明 |
| --- | :-: | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase 项目 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase 匿名 Key |
| `OPENAI_API_KEY` | ✅ | OpenAI 兼容 API Key（仅服务端，勿加 `NEXT_PUBLIC_` 前缀） |
| `OPENAI_BASE_URL` | | API 地址，默认 `https://api.openai.com/v1` |
| `OPENAI_MODEL` | | 主模型，默认 `gpt-4o` |
| `OPENAI_SMALL_MODEL` | | 轻量模型（项目命名等），默认 `gpt-4o-mini` |
| `NEXT_PUBLIC_APP_URL` | | 应用地址（OAuth 回调用），默认 `http://localhost:3000` |

在 Supabase 控制台开启 **Google OAuth**，并把回调地址 `{NEXT_PUBLIC_APP_URL}/api/auth/callback` 加入白名单。

### 3. 初始化数据库

依次执行 [`supabase/migrations/`](supabase/migrations) 下的 SQL 脚本（`001` → `004`）：可直接粘贴到 Supabase SQL Editor，或使用 Supabase CLI 应用迁移。脚本会创建全部表结构、索引与 RLS 行级安全策略。

### 4. 启动开发服务器

```bash
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)，用 Google 账号登录后即可开始使用。

> **WebContainer 说明**：预览功能依赖 `SharedArrayBuffer`，需要安全上下文（localhost / HTTPS）。项目已在 [`next.config.ts`](next.config.ts) 中配置 `Cross-Origin-Embedder-Policy` / `Cross-Origin-Opener-Policy` 响应头，本地与部署均开箱可用。请使用最新版 Chrome / Edge。

### 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` | 生产构建 |
| `pnpm start` | 启动生产服务器 |
| `pnpm lint` | ESLint 检查 |
| `npx tsc --noEmit` | TypeScript 类型检查 |

## 界面与交互

登录后为三栏布局（侧边栏 + 对话 + 预览）；无活动项目时显示欢迎页，可直接输入想法，AI 会生成项目名并自动创建项目。

- **侧边栏**：项目列表（切换 / 重命名 / 删除）
- **对话面板**：消息流带 Agent 头像与颜色徽章、思考过程折叠展示、工具调用卡片（状态：执行中 / 成功 / 失败）、`@mention` 自动补全下拉
- **预览面板**：Tabs 切换「编辑器 / 终端 / 浏览器」，编辑器内为文件树 + Monaco；浏览器为 WebContainer 内运行的实时应用
- **版本历史**：按时间倒序列出每次快照（含说明与产出 Agent），一键回滚任意历史版本

## 技术栈

| 类别 | 选型 |
| --- | --- |
| 框架 | Next.js 16（App Router）+ React 19 + TypeScript |
| 样式 | Tailwind CSS 4 + shadcn/ui（Radix UI） |
| 状态管理 | Zustand 5 |
| 认证 / 数据库 | Supabase（PostgreSQL + RLS + Google OAuth） |
| AI | OpenAI SDK（兼容任意 OpenAI 格式 API，流式） |
| 编辑器 / 终端 | Monaco Editor + XTerm.js |
| 运行时 | WebContainer API（浏览器内 Node.js） |
| 包管理 | pnpm |

## 项目结构

```
src/
├── app/
│   ├── api/
│   │   ├── chat/route.ts            # AI 对话流式 API（注入 Agent 提示词与工具）
│   │   ├── generate-name/route.ts   # AI 项目命名
│   │   └── auth/callback/route.ts   # OAuth 回调
│   ├── login/page.tsx               # 登录页（Google OAuth）
│   ├── page.tsx                     # 主页（服务端认证分发）
│   └── layout.tsx                   # 根布局
├── components/
│   ├── chat/                        # 对话面板、消息卡片、Agent 徽章、@mention 补全
│   ├── layout/                      # 三栏布局与应用协调器
│   ├── preview/                     # 预览面板（编辑器/文件树/浏览器/终端）
│   ├── sidebar/                     # 项目列表侧边栏
│   ├── ui/                          # shadcn/ui 基础组件
│   └── welcome-page.tsx             # 欢迎页（无项目直接开聊）
├── lib/
│   ├── agents/config.ts             # 5 个 Agent 定义（systemPrompt / 工具 / 颜色）
│   ├── store/                       # Zustand stores（chat / preview / project / auth / agent / version）
│   ├── supabase/                    # 浏览器端、服务端客户端与认证中间件
│   ├── types/                       # Agent 与数据库类型定义
│   ├── utils/mention-parser.ts      # @mention 解析（中文/英文/别名）
│   ├── webcontainer/index.ts        # WebContainer 启动与实例管理
│   └── utils.ts                     # cn 等通用工具
├── middleware.ts                    # 路由级认证保护
supabase/migrations/                 # 001~004：表结构 + RLS + 版本快照
```

## 数据模型

所有表都启用了 RLS，数据按 `projects.user_id = auth.uid()` 隔离，并随项目级联删除：

- **projects** — 用户项目（`id` / `user_id` / `name` / 时间戳）
- **messages** — 对话消息（`project_id` / `role` / `content` / `agent_id`）
- **files** — 项目文件（`project_id` / `path` / `content`，`(project_id, path)` 唯一）
- **project_versions** — 版本快照（`version_number` 按项目递增、`description`、`agent_id`）
- **version_files** — 快照内的文件副本（`version_id` / `path` / `content`）

## License

[Apache License 2.0](LICENSE)
