# Kelpo

Send original files as one expiring link that works in WhatsApp, Instagram and email —
no signup, no compression, no attachment caps.

- **App:** https://usekelpo.vercel.app
- **API:** https://kelpo.mutawakkil280.workers.dev

## What it does

A designer picks up to 15 originals, sets an expiry (24 hours, 7 or 30 days), and sends
one link. The client opens it on a phone, previews the files, leaves notes if they want,
and downloads the originals or a ZIP. The link dies on the chosen date and the files are
deleted.

The first screen says this in plain words: **pick files → set an expiry → send one link**,
with a compressed-versus-original comparison underneath. No account, no app, no jargon.
Recipients never see a signup prompt.

## Hosted on free tiers

| Concern | Where | Why |
| --- | --- | --- |
| React app and `/p/:slug` OG route | Vercel | `.vercel.app` works; preview deploys included |
| API, CORS, OG images, expiry job | Cloudflare Worker | 100k requests/day free, no cold starts |
| Metadata, accounts, notes, likes | Cloudflare D1 | 5M reads / 100k writes / 5 GB free |
| Originals and previews | Supabase Storage | 1 GB free, no card needed today |
| Cron | `*/10 * * * *` | deletes expired files and rows |

R2 is deferred until a valid card is on Cloudflare. Swapping back means replacing
`src/worker/lib/storage.ts`; nothing else changes.

## The three product directions, first slice

**1. Sender accounts — optional.** Creating and sending never asks for an account. A
sender who chooses *"Save links to an account"* signs up, and links made in that browser
are claimed through the owner token. The dashboard shows history, view counts, *Stop
link*, *Add 24 hours / 7 days / 30 days*, and a brand kit (accent colour and logo).

**2. Client feedback.** Anyone with the link can drop numbered pins on images with a
note and their name. No account. Notes appear as markers on the image and in a list
under the gallery.

**3. Growth hooks.** Brand kit applied to every client page, a Studio waitlist, and
a "Sent with Kelpo" sheet shown once when a recipient opens their first file. Likes
are one per visitor and open a short thank-you card. No payment is taken yet.

## Product writing

Every string is chosen to be concrete and easy. See [`docs/COPY.md`](docs/COPY.md)
for the rules and banned filler words. Examples: *Drop files here*, *Link expires
after*, *Download all originals (.zip)*, *Previews are light. Downloads are the real
files.*, *This link has ended. The files were deleted.*

## Verification

- `pnpm typecheck`, `pnpm build`, `pnpm test` (11 unit/route tests)
- `pnpm test:e2e` (10 Playwright tests, mobile 320–390 px and desktop)
- Audited at 320, 390, 768, 1280 and 1920 px: no horizontal overflow, no overlapping
  text. Tap targets are at least 28 px.
- Custom 404 at `/<unknown>`, matching the product with a clear way forward.

## Local development

Node 22.12+ (`.nvmrc`) and pnpm. Then:

```
pnpm install
pnpm db:local
pnpm build
pnpm dev:worker     # http://localhost:8787
pnpm dev:web        # http://localhost:5173
```

Leave `VITE_API_URL` unset locally so Vite proxies `/api` to the Worker. Copy
`.env.example` for the production variable names. Never commit `.dev.vars` or secrets.

## Deploy

Worker: `wrangler d1 migrations apply kelpo --remote`, set `SESSION_SECRET` and
`SUPABASE_SERVICE_KEY` with `wrangler secret put`, then `pnpm deploy`.

Vercel: import the repo. `vercel.json` sets Vite, `pnpm build` and `web/dist`. Env vars:
`VITE_API_URL`, `KELPO_API_URL`, `VITE_SITE_URL`. `/p/:slug` rewrites to the edge
function that injects the link's OG tags; `/dashboard` rewrites to the SPA shell.

Deployment details and IDs: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## More docs

- [`docs/DECISIONS.md`](docs/DECISIONS.md) — free-tier research and why each service
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — data model, API and flows
- [`docs/DESIGN.md`](docs/DESIGN.md) — visual language and fitted motion
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — what remains in phases 2–4

## Credits

By **Mutawakkil** · [Instagram @itsmutawakkil](https://instagram.com/itsmutawakkil) ·
[X @itsmutawakkil](https://x.com/itsmutawakkil) ·
[GitHub Mutawakkil-Yusuf](https://github.com/Mutawakkil-Yusuf)
