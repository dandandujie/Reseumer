# Reseumer

一个桌面端优先的 AI 简历应用，基于 **Tauri 2 + React 19 + Vite** 构建。所有数据保存在本地 SQLite，不需要登录、不需要后端服务。

原项目链接：<https://github.com/twwch/JadeAI>

## 当前能做什么

- 在仪表盘中管理多份简历。
- 通过拖拽和实时预览编辑简历内容。
- 只维护一个生产模板：`classic`。
- 导出 PDF、单页 PDF、DOCX、HTML、TXT、JSON。
- 将 JSON 导出再次导回应用。
- 解析已有 PDF 或图片简历，生成可编辑数据。
- 使用 AI 聊天改简历、生成简历、生成求职信、做语法检查、做 JD 匹配分析和翻译。
- 在应用内配置 OpenAI、Anthropic、Gemini 或兼容 OpenAI 的接口，不需要在启动前设置环境变量。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 桌面壳 | Tauri 2（Rust） |
| 前端框架 | React 19 + Vite 7 |
| 路由 | React Router 6 |
| UI | Tailwind CSS 4 + shadcn/ui + Radix UI |
| 状态管理 | Zustand |
| 拖拽 | `@dnd-kit` |
| 国际化 | i18next + react-i18next |
| 数据库 | SQLite（Rust 侧 `rusqlite` 嵌入） |
| 导出 | `docx-rs`（DOCX）、自渲染 HTML、Rust 侧 PDF 链路 |
| PDF 解析 | `pdf-extract`（上传简历解析） |
| AI 调用 | Rust `reqwest` 流式代理 OpenAI / Anthropic / Gemini / 兼容接口 |

## 环境要求

- Node.js 20+
- pnpm 9+
- Rust 稳定版工具链（通过 `rustup` 安装）
- Tauri 系统依赖参考 <https://v2.tauri.app/start/prerequisites/>
  - macOS：Xcode Command Line Tools
  - Windows：Microsoft C++ Build Tools 与 WebView2
  - Linux：`webkit2gtk-4.1`、`libappindicator`、`librsvg` 等

## 快速开始

```bash
pnpm install
pnpm dev
```

`pnpm dev` 会启动 Vite 开发服务器并拉起 Tauri 窗口。首次启动会自动在用户数据目录创建 SQLite 数据库文件。

仅想在浏览器里预览前端 UI（不含 Tauri 命令）：

```bash
pnpm dev:vite
```

## 常用命令

```bash
pnpm dev           # Tauri + Vite 开发模式
pnpm dev:vite      # 仅启动 Vite（浏览器预览，Tauri invoke 不可用）
pnpm build         # 当前平台打包
pnpm build:mac     # macOS (Apple Silicon) DMG 构建
pnpm build:win     # Windows x86_64 NSIS 构建
pnpm lint
pnpm type-check
```

macOS Intel 当前未在 CI 中构建，本地可执行 `pnpm tauri build --target x86_64-apple-darwin`。

## AI 与数据

AI 密钥、Base URL、模型都在应用「设置」页内配置，写入本地 SQLite 的 `users.settings` 字段，不在启动前暴露为环境变量。AI 请求由 Rust 侧 `reqwest` 负责流式转发，前端通过 Tauri event 接收分片。

桌面端所有数据保存在 Tauri 的 `app_data_dir/reseumer.db`：

- macOS：`~/Library/Application Support/com.reseumer.desktop/reseumer.db`
- Windows：`%APPDATA%\com.reseumer.desktop\reseumer.db`
- Linux：`~/.local/share/com.reseumer.desktop/reseumer.db`

## 项目结构

```text
src-tauri/                  Tauri 桌面壳（Rust）
├── src/
│   ├── commands/           暴露给前端的 Tauri 命令（resume / user / ai / chat / export）
│   ├── db/                 rusqlite 连接、迁移执行器、按实体划分的 repo
│   ├── ai/                 provider、流式、prompts、工具调用、JSON 提取
│   └── export/             PDF / HTML / DOCX / TXT / 二维码生成
└── migrations/             SQLite schema 迁移
src/
├── pages/                  dashboard / editor / preview 三个顶层页面
├── router.tsx              React Router 路由定义
├── components/             编辑器、仪表盘、AI、预览、布局、设置
├── stores/                 Zustand stores（editor / resume / settings / ui）
├── lib/                    Tauri API 封装、AI client、导出工具、品牌常量
└── i18n/                   i18next 配置
messages/                   国际化翻译（zh / en）
packaging/homebrew/         macOS Homebrew Cask 模板
.github/workflows/          构建与发布的 GitHub Actions
```

## 说明与限制

- 当前运行时只保留 `classic` 一个模板。
- 所有导出都由 Tauri 命令完成，不再依赖本机 Chrome / Chromium。
- GitHub Actions 只构建 `aarch64-apple-darwin` 和 `x86_64-pc-windows-msvc`。Intel Mac、Linux 与 Windows ARM 需要本地自行构建。
- 简历数据保存在本地 SQLite 中，卸载应用会带走数据；换设备前请先用 **导出 JSON** 做备份。

## macOS 首次启动

本项目的 macOS 安装包只做了 ad-hoc 签名，没有 Apple Developer ID 签名和公证。直接双击从 Release 下载的 `.dmg` 安装后，首次打开可能会被 Gatekeeper 拦下（提示「已损坏」或「未鉴定开发者」）。有两种解决方式：

**方式 A：通过 Homebrew 安装（推荐，无感）**

Homebrew 安装的应用会自动跳过 Gatekeeper quarantine 检查：

```bash
brew tap dandandujie/reseumer
brew install --cask reseumer
```

tap 仓库的 Cask 模板见 [`packaging/homebrew/reseumer.rb`](./packaging/homebrew/reseumer.rb)。

**方式 B：直接下载 DMG 后手动放行**

安装到 `/Applications` 后，打开终端执行一次即可：

```bash
xattr -cr /Applications/Reseumer.app
```

之后正常双击打开。或者在 Finder 里**右键点击 → 打开**，在弹出的警告对话框里选「打开」也可以。

## 许可证

Apache-2.0，见 [LICENSE](./LICENSE)。

## 友情链接

- [linux.do](https://linux.do)
