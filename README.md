# Reseumer

Desktop-first AI resume builder built with Next.js 16, React 19, and Electron.

This repository is no longer the original JadeAI product. It has been narrowed into a simpler resume workflow centered on one production-ready template and desktop delivery for macOS and Windows.

[中文文档](./README.zh-CN.md)

## What It Does

- Manage multiple resumes from a dashboard.
- Edit resumes with drag-and-drop sections and live preview.
- Use a single maintained template: `classic`.
- Export resumes as PDF, one-page PDF, DOCX, HTML, TXT, or JSON.
- Import JSON exports back into the app.
- Parse existing PDF or image resumes into editable data.
- Use AI for chat editing, full resume generation, cover letters, grammar checks, JD match analysis, and translation.
- Run as an Electron desktop app or as a local/web Next.js app.

## What Was Removed From The Upstream Project

The current product intentionally does **not** include these old upstream features:

- template gallery / multi-template runtime
- resume sharing and public share pages
- mock interview flows and reports
- LinkedIn photo generation
- onboarding / product tour

This README documents the current codebase only.

## Current Product Scope

### Editor and Resume Workflow

- Dashboard for creating, duplicating, renaming, deleting, and importing resumes.
- Drag-and-drop section ordering with inline editing.
- Theme controls for color, spacing, margins, fonts, and font size.
- Chinese font presets, including `宋体`, `微软雅黑`, `楷体`, and `霞鹜文楷`.
- Real-time preview based on the same `classic` template used by export.

### AI Features

- AI resume generation from role, experience, and skills.
- In-editor AI chat assistant with persistent chat sessions.
- Resume parsing from uploaded PDF/image files.
- JD match analysis with saved history.
- Grammar and writing quality checks with history.
- Cover letter generation.
- Resume translation workflow.
- In-app AI provider settings for OpenAI, Anthropic, Gemini, or compatible endpoints.

### Export and Data

- Export formats: `pdf`, `pdf-one-page`, `docx`, `html`, `txt`, `json`.
- JSON import on the dashboard and inside the editor.
- SQLite by default, PostgreSQL optional.
- Chinese and English UI.

### Desktop Runtime

- Electron main process boots a bundled Next.js standalone server in production.
- Desktop mode defaults to local SQLite and disables auth unless you explicitly change the runtime.
- macOS and Windows packaging is configured through `electron-builder`.

## Tech Stack

| Layer | Technology |
| --- | --- |
| App shell | Electron 36 |
| Web framework | Next.js 16 App Router |
| UI | React 19, Tailwind CSS 4, shadcn/ui, Radix UI |
| State | Zustand |
| Drag and drop | `@dnd-kit` |
| Database | Drizzle ORM with SQLite or PostgreSQL |
| Auth | NextAuth v5 with optional Google OAuth |
| AI | Vercel AI SDK |
| Supported AI providers | OpenAI, Anthropic, Gemini, OpenAI-compatible APIs |
| Export | Puppeteer Core, DOCX |
| i18n | next-intl |

## Requirements

- Node.js 20+ recommended
- pnpm 9+
- Google Chrome or Chromium for local PDF export, or set `CHROME_PATH`

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Create local environment file

```bash
cp .env.example .env.local
```

For desktop development, the defaults are enough in most cases.

### 3. Start the desktop app

```bash
pnpm desktop:dev
```

This starts:

- Next.js dev server on `http://127.0.0.1:3000`
- Electron desktop shell pointing at that local renderer

### 4. Or run the web app only

```bash
pnpm dev
```

Open `http://localhost:3000`.

## Environment Variables

The app does **not** require server-side AI keys at boot. AI credentials are configured in the app settings and sent through request headers when needed.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `APP_NAME` | No | `Reseumer` | Display name used by the app/runtime |
| `AUTH_ENABLED` | No | `false` | Enable Google sign-in for web mode |
| `AUTH_SECRET` | If auth enabled | none | Required by NextAuth when auth is enabled |
| `GOOGLE_CLIENT_ID` | If auth enabled | none | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | If auth enabled | none | Google OAuth |
| `DB_TYPE` | No | `sqlite` | `sqlite` or `postgresql` |
| `DATABASE_URL` | If PostgreSQL | none | PostgreSQL connection string |
| `SQLITE_PATH` | No | `./data/reseumer.db` | SQLite file path in web/local mode |
| `DEFAULT_LOCALE` | No | `zh` | `zh` or `en` |
| `CHROME_PATH` | Optional | none | Explicit Chrome/Chromium path for PDF export |

### Desktop-specific behavior

When launched through Electron, the app currently forces these runtime defaults unless you override them:

- `APP_NAME=Reseumer`
- `AUTH_ENABLED=false`
- `DB_TYPE=sqlite`
- `SQLITE_PATH=<app data>/reseumer.db`

## Useful Commands

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

## Build Desktop Packages

### Package without installer metadata checks

```bash
pnpm desktop:build:dir
```

Outputs unpacked app bundles into `release/`.

### Package for macOS

```bash
pnpm desktop:build:mac
```

### Package for Windows

```bash
pnpm desktop:build:win
```

## Project Structure

```text
electron/                  Electron main/preload
scripts/                   desktop and build helpers
src/app/                   Next.js routes and API endpoints
src/components/dashboard/  resume list and creation flows
src/components/editor/     editor, dialogs, AI tools, export UI
src/components/preview/    on-screen resume preview
src/lib/                   database, AI, export, config utilities
drizzle/                   database migrations
public/                    icons and static assets
```

## Notes And Limitations

- The runtime export template is intentionally fixed to `classic`.
- Historical README screenshots and feature descriptions from JadeAI are no longer accurate.
- Local/web PDF export needs Chrome or Chromium available unless you provide `CHROME_PATH`.
- Some internal storage keys still include legacy names for migration compatibility.

## Validation

The current desktop workflow has been exercised with:

- `pnpm install`
- `pnpm type-check`
- `pnpm desktop:dev`
- `pnpm desktop:build:dir`

## License

Apache-2.0. See [LICENSE](./LICENSE).
