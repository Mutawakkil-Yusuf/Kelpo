# Kelpo

Send original files as one expiring link that works in WhatsApp, Instagram and email —
no signup, no compression, no attachment caps.

**Status: MVP built.** The create → share → preview → download flow is implemented and
covered by tests. Deployment is the remaining step.

## Hosting

The React app runs on **Vercel** (`.vercel.app` works fine). The API, database, files
and expiry job stay on **Cloudflare**:

| Concern | Where | Why |
| --- | --- | --- |
| React app | Vercel | `vercel.app` domain, preview deploys, simple Vite builds |
| OG route `/p/:slug` | Vercel edge function | keeps one share URL and real chat-preview tags |
| API + CORS | Cloudflare Worker | 100k requests/day free, no cold starts |
| Metadata | Cloudflare D1 | 5M reads / 100k writes / 5 GB free, no egress charge |
| Originals | Supabase Storage | 1 GB free, no card needed; R2 can replace it later when billing is available |
| Expiry | Cron Trigger + immediate checks | exact deletion, cron can lag harmlessly |

Auth uses tokens in headers and query strings, not cookies. `vercel.app` and
`workers.dev` are different sites, so cookies would be third-party and unreliable.
Token auth also means no same-site domain requirement.

Supabase free projects pause after a week of inactivity and allow 1 GB storage /
5 GB egress. That is enough while Kelpo is small; switch the storage module back to
R2 for zero egress and more room once a card is on file.

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
- Password gate with signed tokens, expiry checks on every request, rate limits, reports
- Cron purge of expired files and rows at expiry
- Recipient prompt on first file open: "Sent with Kelpo" with a create-link action
- One like per visitor with a short thank-you popup
- Credit line on every screen: By Mutawakkil, with Instagram, X and GitHub links

## Deploy

**Cloudflare**

1. The D1 database `kelpo` already exists and the schema is applied (`wrangler.jsonc`
   holds its id). Recreate only if starting from scratch.
2. The Supabase project `kelpo` and private bucket `kelpo-files` already exist.
3. Set secrets with `wrangler secret put`: `SESSION_SECRET` and `SUPABASE_SERVICE_KEY`.
4. `pnpm deploy`

**Vercel**

1. Import the repo; Vercel reads `vercel.json` (Vite, `web/dist`, `pnpm`)
2. Add env vars:
   - `VITE_API_URL` — worker origin (used by the browser)
   - `KELPO_API_URL` — worker origin (used by the `/p/:slug` edge function)
3. Deploy — `/p/:slug` is served by `api/p/[slug].ts`

## Local development

1. Node 22.12+ (see `.nvmrc`; Wrangler 4 requires it) and pnpm (`corepack enable`).
2. `pnpm install`
3. `pnpm db:local`
4. `pnpm build`
5. Two terminals: `pnpm dev:worker` (http://localhost:8787) and `pnpm dev:web` (http://localhost:5173).
   Leave `VITE_API_URL` unset so Vite proxies `/api` to the Worker.
6. Trigger cleanup locally: `curl "http://localhost:8787/cdn-cgi/local/scheduled"`

Checks: `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm test:e2e` (Playwright,
mobile 390×844 and desktop; set `PLAYWRIGHT_BASE_URL` and `LINK_SLUG` to test another
environment).

## Layout

```
api/p/[slug].ts        Vercel edge function: injects og: tags into the SPA shell
docs/                  research, architecture, design, copy, roadmap
migrations/            D1 schema
src/worker/            Hono API, CORS, OG card, cron cleanup
  lib/                 tokens, passwords, validation, zip, cleanup, storage, OG card
  routes/              create, link, file/og, report
web/                   Vite + React SPA
  src/lib/             api client, formatting, thumbnails, token storage
tests/                 pure-logic and full route-flow tests
vercel.json            Vercel build settings
wrangler.jsonc         Worker, D1, R2, cron
```

## Not in this build

Accounts, dashboards, link history, revoke/extend, opened notifications, resumable
uploads, pinned feedback, custom domains, payments, native apps. See the roadmap.
