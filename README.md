# SaaS CRM-go

A multi-tenant SaaS CRM built as a TypeScript monorepo — a Next.js web dashboard, an Express API, and a Python data scraper, sharing a common workspace.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Web | Next.js 15, React 19, TypeScript |
| API | Express, Node.js |
| Scraper | Python |
| Workspace | npm workspaces monorepo (`apps/*`, `packages/*`) |

## Project Structure

```
SaaS CRM-go/
├── apps/
│   ├── web/          # Next.js dashboard (auth, invites, public pages)
│   ├── api/           # Express REST API
│   └── scraper/       # Python data extraction/analysis scripts
└── packages/          # Shared code across apps
```

## Getting Started

```bash
npm install
npm run dev
```

Each app under `apps/` can also be run independently — see its own `package.json` for scripts. Configure required environment variables (database, API keys) in `.env` files before running.
