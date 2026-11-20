# Kelpo

Send original files as one expiring link that works in WhatsApp, Instagram and email —
no signup, no compression, no attachment caps.

**Status: MVP built.** The create → share → preview → download flow is implemented and
covered by tests. Deployment to Cloudflare is the remaining step.

## Stack (researched 20 Nov 2026)

| Concern | Choice | Why |
| --- | --- | --- |
| App + API | Cloudflare Workers + Hono | 100k requests/day free, no cold starts, one platform |
| Metadata | Cloudflare D1 | 5M reads / 100k writes / 5 GB free, no egress charge |
| Originals | Cloudflare R2 | 10 GB free, **zero egress** — critical for downloads |
| Expiry | Cron Trigger + immediate checks | exact deletion, cron can lag harmlessly |
| UI | Vite + React + TS + Tailwind | small client bundle for mobile data |

Decisions and sources: [`docs/DECISIONS.md`](docs/DECISIONS.md).
System design and API surface: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
Visual language and fitted motion: [`docs/DESIGN.md`](docs/DESIGN.md).
Product writing rules: [`docs/COPY.md`](docs/COPY.md).
Scope and phases: [`docs/ROADMAP.md`](docs/ROADMAP.md).

## What works

- Anonymous create: up to 15 JPG/PNG/WebP/GIF/PDF files, 25 MB each, with type sniffing
- Light WebP previews made on the phone; originals stay byte-for-byte in R2
- Title, client note, 24h / 7d / 30d expiry, optional password
- Chat card preview before sending, with OG title/description/thumbnail
- Client gallery, fullscreen viewer, per-file download, download all as ZIP
- Password gate with signed cookie, expiry checks on every request, rate limits, reports
- Cron purge of R2 objects and D1 rows at expiry

## Setup

1. Node 22.12+ (see `.nvmrc`; Wrangler 4 requires it) and pnpm (`corepack enable`).
2. `pnpm install`
3. Apply the local D1 migration: `pnpm db:local`
4. Build the client once: `pnpm build`
5. Two terminals: `pnpm dev:worker` (http://localhost:8787) and `pnpm dev:web` (http://localhost:5173).
   Vite proxies `/api` and `/p` to the Worker. Local D1/R2/cron need no Cloudflare account.
6. Trigger cleanup locally: `curl "http://localhost:8787/cdn-cgi/local/scheduled"`

For production: `wrangler d1 create kelpo`, `wrangler r2 bucket create kelpo-files`,
put the real ids in `wrangler.jsonc`, set `APP_URL` and `SESSION_SECRET`, then
`pnpm db:remote && pnpm deploy`.

Checks: `pnpm typecheck`, `pnpm build`, `pnpm test`.

## Layout

```
docs/                  research, architecture, design, copy, roadmap
migrations/            D1 schema
src/worker/            Hono API, OG handler, cron cleanup
  lib/                 tokens, passwords, validation, zip, cleanup, OG card
  routes/              create, link, file/og, report
web/                   Vite + React SPA
  src/pages/           CreatePage, LinkPage
  src/lib/             api client, formatting, thumbnail maker
tests/                 pure-logic and full route-flow tests
vite.config.ts         dev proxy + build
vitest.config.ts       test root
wrangler.jsonc         Worker, D1, R2, assets, cron
```

## Not in this build

Accounts, dashboards, link history, revoke/extend, opened notifications, resumable
uploads, pinned feedback, custom domains, payments, native apps. See the roadmap.
