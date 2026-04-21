# Reseumer

一个以桌面端为优先形态的 AI 简历应用，基于 Next.js 16、React 19 和 Electron 构建。

原项目链接：<https://github.com/twwch/JadeAI>

## 当前能做什么

- 在仪表盘中管理多份简历。
- 通过拖拽和实时预览编辑简历内容。
- 只维护一个生产模板：`classic`。
- 导出 PDF、单页 PDF、DOCX、HTML、TXT、JSON。
- 将 JSON 导出再次导回应用。
- 解析已有 PDF 或图片简历，生成可编辑数据。
- 使用 AI 聊天改简历、生成简历、生成求职信、做语法检查、做 JD 匹配分析和翻译。
- 既可以作为 Electron 桌面应用运行，也可以作为本地 / Web 版 Next.js 应用运行。

## 当前产品范围

### 简历编辑与工作流

- 支持创建、复制、重命名、删除、导入简历。
- 支持模块拖拽排序和行内编辑。
- 支持颜色、间距、页边距、字体、字号等样式设置。
- 已加入中文字体预设：`宋体`、`微软雅黑`、`楷体`、`霞鹜文楷`。
- 预览和导出都基于同一套 `classic` 模板。

### AI 能力

- 根据岗位、经验和技能生成完整简历。
- 编辑器内 AI 聊天助手，支持历史会话。
- 上传 PDF / 图片后解析已有简历。
- JD 匹配分析，并保存历史记录。
- 语法与表达检查，并保存历史记录。
- 求职信生成。
- 简历翻译。
- 在应用内配置 OpenAI、Anthropic、Gemini 或兼容 OpenAI 的接口。

### 导出与数据

- 导出格式：`pdf`、`pdf-one-page`、`docx`、`html`、`txt`、`json`。
- 仪表盘和编辑器都支持 JSON 导入。
- 默认使用 SQLite，也可切换 PostgreSQL。
- 支持中英文界面。

### 桌面端运行方式

- Electron 主进程在生产环境中启动打包后的 Next.js standalone 服务。
- 桌面模式默认走本地 SQLite，并关闭登录认证。
- 已配置 `electron-builder`，可打 macOS / Windows 包。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 桌面壳 | Electron 36 |
| Web 框架 | Next.js 16 App Router |
| UI | React 19、Tailwind CSS 4、shadcn/ui、Radix UI |
| 状态管理 | Zustand |
| 拖拽 | `@dnd-kit` |
| 数据库 | Drizzle ORM + SQLite / PostgreSQL |
| 认证 | NextAuth v5，可选 Google OAuth |
| AI | Vercel AI SDK |
| AI 提供方 | OpenAI、Anthropic、Gemini、兼容 OpenAI 的接口 |
| 导出 | Puppeteer Core、DOCX |
| 国际化 | next-intl |

## 环境要求

- 推荐 Node.js 20+
- pnpm 9+
- 本地导出 PDF 时需要 Google Chrome 或 Chromium，或者手动设置 `CHROME_PATH`

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 复制环境变量文件

```bash
cp .env.example .env.local
```

如果只是跑桌面开发版，默认配置通常就够用。

### 3. 启动桌面应用

```bash
pnpm desktop:dev
```

这个命令会同时启动：

- `http://127.0.0.1:3000` 上的 Next.js 开发服务器
- 指向该本地地址的 Electron 桌面壳

### 4. 或者只启动 Web 版

```bash
pnpm dev
```

然后打开 `http://localhost:3000`。

## 环境变量说明

应用启动时不要求预先在服务端写死 AI Key。AI 密钥、Base URL、模型都在应用设置页里配置，并在调用时通过请求头传递。

| 变量 | 是否必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `APP_NAME` | 否 | `Reseumer` | 应用显示名称 |
| `AUTH_ENABLED` | 否 | `false` | Web 模式下是否启用 Google 登录 |
| `AUTH_SECRET` | 启用认证时必填 | 无 | NextAuth 所需 |
| `GOOGLE_CLIENT_ID` | 启用认证时必填 | 无 | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | 启用认证时必填 | 无 | Google OAuth |
| `DB_TYPE` | 否 | `sqlite` | `sqlite` 或 `postgresql` |
| `DATABASE_URL` | PostgreSQL 时必填 | 无 | PostgreSQL 连接串 |
| `SQLITE_PATH` | 否 | `./data/reseumer.db` | Web / 本地模式的 SQLite 文件路径 |
| `DEFAULT_LOCALE` | 否 | `zh` | `zh` 或 `en` |
| `CHROME_PATH` | 可选 | 无 | 指定本地 Chrome / Chromium 路径，用于 PDF 导出 |

### 桌面端的默认行为

通过 Electron 启动时，当前会默认使用这些运行时配置，除非你主动覆盖：

- `APP_NAME=Reseumer`
- `AUTH_ENABLED=false`
- `DB_TYPE=sqlite`
- `SQLITE_PATH=<应用数据目录>/reseumer.db`

## 常用命令

```bash
pnpm dev
pnpm type-check
pnpm lint
pnpm build
pnpm desktop:dev
pnpm desktop:build:dir
pnpm desktop:build:mac
pnpm desktop:build:win
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

## 构建桌面应用

### 生成未封装目录产物

```bash
pnpm desktop:build:dir
```

产物会输出到 `release/`。

### 构建 macOS 包

```bash
pnpm desktop:build:mac
```

### 构建 Windows 包

```bash
pnpm desktop:build:win
```

## 项目结构

```text
electron/                  Electron 主进程与 preload
scripts/                   桌面端与构建辅助脚本
src/app/                   Next.js 页面与 API 路由
src/components/dashboard/  仪表盘与新建简历流程
src/components/editor/     编辑器、AI 弹窗、导出界面
src/components/preview/    简历预览
src/lib/                   数据库、AI、导出、配置等工具
drizzle/                   数据库迁移
public/                    图标与静态资源
```

## 说明与限制

- 当前运行时只保留 `classic` 一个模板。
- 本地 / Web 模式下的 PDF 导出依赖系统中的 Chrome 或 Chromium，除非显式设置 `CHROME_PATH`。
- 某些本地存储键仍保留旧名字的兼容迁移逻辑，这是为了兼容旧数据，不代表当前品牌名。

## 已验证流程

当前桌面工作流已经实际跑通过：

- `pnpm install`
- `pnpm type-check`
- `pnpm desktop:dev`
- `pnpm desktop:build:dir`

## 许可证

Apache-2.0，见 [LICENSE](./LICENSE)。

## 友情链接

- [linux.do](https://linux.do)
