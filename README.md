# Resumer

桌面端求职全流程 AI Agent：**简历管理 → 定向优化 → 投递执行 → 复盘迭代**，基于 **Tauri 2 + React 19 + Vite** 构建。所有数据保存在本地 SQLite，不需要登录、不需要后端服务。

原项目链接：<https://github.com/twwch/JadeAI>

## 它能做什么

### 简历管理与编辑
- 仪表盘管理多份简历，卡片直接展示内容摘要（姓名/岗位/最近经历/技能）
- 拖拽排序 + 实时 A4 预览编辑；`classic` / `modern` 两套模板
- 导出 PDF、单页 PDF、DOCX、HTML、TXT、JSON；JSON 可再导入
- 上传 PDF / 图片简历，AI 解析为可编辑数据

### AI 简历专家（单简历助手）
- 内置**中国就业市场专家知识**：HR 初筛视线路径、ATS 机筛关键词逻辑、六大行业岗位画像（互联网技术/产品运营/金融/国企央企/外企/制造工程）、量化写作法则与造假红线
- 对话式直接修改简历（工具调用可视化 + 改动提案卡，用户确认后生效）
- JD 匹配分析（硬性门槛/关键词对齐/ATS 评分）→ 一键优化，或**一键派生定制简历副本**（主简历不动）
- 语法检查（中文简历专项病灶）、中英互译（本地化而非直译）、AI 生成完整初稿
- 求职文案生成器：Boss 直聘开场白 / 邮件求职信 / 一分钟自我介绍

### 全局 Agent（跨简历策略顾问）
- 站在全局视角：全部简历元数据 + 求职日志 + 版本历史（AI 采纳/拒绝率）
- 求职漏斗分析（对照本土基准归因瓶颈）、渠道归因、金三银四/秋招春招节奏校准
- **有权直接优化单简历助手**：下发调优指令（注入其每次对话）、直接修订技能库——用数据说话，改完告知

### Agent 架构（GenericAgent 移植，MIT）
- **L0-L4 五层记忆**：元规则 → 索引 → 全局事实 → 技能库 → 会话归档，外加会话级工作检查点
- **技能 SOP 自进化**：9 个内置种子技能（岗位画像 ×6 + 简历诊断/JD 定制/申请表填写 SOP），markdown 文件可手工编辑，AI 会把新经验结晶为新技能
- **浏览器驱动**：本地 WS 服务 + 油猴脚本连接你真实登录态的浏览器（覆盖 Boss/猎聘等平台与 Moka/北森/Workday 等 ATS），支持读取 JD、**官网申请表自动填写**（只填不提交，敏感信息不经手）
- **联网搜索**：模型内建（Gemini/Claude 原生）/ DuckDuckGo 免费引擎 / Tavily API 三模式

### 对话体验
- 打字机流式 + 思维链展示（DeepSeek-R1 / Claude thinking / Gemini thought 三协议，实时思考秒数）
- 停止生成、消息级回退、编辑重发、重新生成；多会话并行互不阻塞
- Markdown + 安全内联 HTML 渲染（对比矩阵、信息卡片等可视化回复）

### 复盘日记（求职 CRM）
- 投递**看板**：已投递 → 初筛 → 面试 → Offer → 已关闭 五列管道，卡片上直接切状态
- 投→面→果线程进度自动关联同公司记录；**跟进提醒**逾期红标
- 渠道预设（Boss直聘/猎聘/内推等）与转化归因，喂给全局 Agent 做策略分析

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 桌面壳 | Tauri 2（Rust） |
| 前端 | React 19 + Vite 7 + Tailwind CSS 4 + shadcn/ui |
| 状态 | Zustand |
| 数据库 | SQLite（rusqlite 内嵌，4 个迁移） |
| AI 调用 | Rust `reqwest` 流式代理 OpenAI 兼容 / Anthropic / Gemini |
| Agent 记忆 | `app_data/memory/*.md` + `app_data/skills/*.md` + SQLite 会话/归档 |
| 浏览器驱动 | tokio-tungstenite 本地 WS（127.0.0.1:17872）+ Tampermonkey 用户脚本 |
| 导出 | 系统 Chromium 系浏览器渲染 PDF；`docx-rs`；自渲染 HTML |

## 快速开始

```bash
pnpm install
pnpm dev        # Vite + Tauri 窗口
```

常用命令：`pnpm build`（打包）、`pnpm build:mac` / `pnpm build:win`、`pnpm lint`、`pnpm type-check`。

首次使用：设置 → AI 配置 填入任一服务商的 API Key（支持测试连接与拉取模型列表）；可选开启联网搜索；要用浏览器自动化则在 设置 → 浏览器驱动 安装油猴脚本。

## 数据与隐私

所有数据均在本机：

- `app_data_dir/reseumer.db` — 简历、会话、归档（macOS: `~/Library/Application Support/com.reseumer.desktop/`）
- `app_data_dir/skills/*.md` — 技能库（可手工编辑）
- `app_data_dir/memory/*.md` — 全局事实与助手调优指令
- API Key 仅存本机 localStorage，请求由桌面端直接发给模型服务商
- 浏览器驱动仅在 127.0.0.1 通信，脚本仅在声明的招聘域名生效；AI 只读取页面和填写表单，**绝不代点提交/发送**

卸载会带走全部数据；换设备前请用「导出 JSON」备份。

## 说明与限制

- PDF 导出调用本机已安装的 Chromium 系浏览器（Chrome/Edge/Brave/Vivaldi/Opera/Arc 均可）；未安装时可先导出 HTML 再用浏览器打印
- GitHub Actions 只构建 `aarch64-apple-darwin` 与 `x86_64-pc-windows-msvc`；Intel Mac / Linux 需本地构建
- 油猴脚本升级后需在 Tampermonkey 中重新粘贴一次（设置里一键复制）

## macOS 首次启动

安装包仅 ad-hoc 签名，首次打开可能被 Gatekeeper 拦截：

**方式 A（推荐）**：`brew tap dandandujie/reseumer && brew install --cask reseumer`

**方式 B**：安装后执行 `xattr -cr /Applications/Resumer.app`，或 Finder 右键 → 打开。

## 许可证

Apache-2.0，见 [LICENSE](./LICENSE)。致谢：Agent 架构参考 [GenericAgent](https://github.com/lsdefine/GenericAgent)（MIT）；对话交互参考 [Cherry Studio](https://github.com/CherryHQ/cherry-studio)。

## 友情链接

- [linux.do](https://linux.do)
