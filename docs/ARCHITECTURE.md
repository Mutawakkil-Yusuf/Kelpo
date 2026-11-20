# Kelpo — architecture (implemented)

## Two origins, one flow

```
Client phone                                    Sender phone
   |                                                  |
   | https://kelpo.vercel.app/p/<slug>                 | https://kelpo.vercel.app/
   v                                                  v
+--------------------------- Vercel --------------------------------+
|  api/p/[slug].ts          edge function: fetches public meta from |
|                           the Worker and writes og: tags into the|
|                           SPA shell. One share URL for chat apps. |
|  web/dist                 built Vite + React app                  |
+---------------------------+--------------------------------------+
                            | fetch /api/* (CORS)
                            v
+--------------------------- Cloudflare --------------------------------+
|  Worker (Hono)                                                        |
|    /api/links             create, upload one file, finalize            |
|    /api/links/:slug       open, unlock, ZIP                            |
|    /api/files/:id         preview / original download from R2          |
|    /api/og/:slug          thumbnail for chat crawlers                 |
|    /api/og-meta/:slug     public title/count/thumbnail id for Vercel   |
|    scheduled()            delete expired objects and rows              |
+-----------------------------------------------------------------------+
        |                          |
        v                          v
   D1 (metadata)             R2 (originals, private)
```

The bucket is never public. Expiry and password checks happen on every request, so
cleanup lag cannot expose a file.

## Why tokens, not cookies

`vercel.app` and `workers.dev` are different sites. `SameSite=Lax` cookies are not sent
on cross-site fetch/XHR, and `SameSite=None` depends on third-party cookies that Safari
blocks. So:

- **Owner token**: random secret returned from create, kept in tab `sessionStorage`,
  sent as `X-Kelpo-Owner`. Server stores only its SHA-256 digest.
- **Access token**: HMAC-signed expiry token returned from unlock, sent as
  `X-Kelpo-Access`. For `<img>` and `<a>` — which cannot set headers — it is appended as
  `?access=<token>`. The client page sends `Referrer-Policy: no-referrer`.

CORS allows exact origins from `ALLOWED_ORIGIN` plus `*.vercel.app` preview URLs, with
`X-Kelpo-Owner` and `X-Kelpo-Access` in `Access-Control-Allow-Headers`.

## Data model (migrations/0001_initial.sql)

- `links` — slug, title, message, password salt/hash, owner token hash, expected file
  count, expires_at, status, view/report counters.
- `files` — id, link FK, R2 key, optional thumbnail key, original name, sniffed MIME,
  size, image dimensions, sort order.
- `rate_events` — IP hash + action + timestamp.
- `reports` — link FK, reason, IP hash.

## API surface

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/links` | Create draft. Returns slug, expiry, owner token. |
| `POST` | `/api/links/:slug/files` | Upload one file (≤25 MB) with optional WebP preview. `X-Kelpo-Owner` required. |
| `POST` | `/api/links/:slug/finalize` | Activate the link; returns the Vercel share URL. |
| `GET` | `/api/links/:slug` | Public file list. Requires `X-Kelpo-Access` when sealed. |
| `POST` | `/api/links/:slug/unlock` | Verify password; return signed access token. |
| `GET` | `/api/files/:id` | Stream original (`attachment`) or light preview (`preview=1`). |
| `GET` | `/api/links/:slug/zip` | Stream all originals as a STORE-mode ZIP. |
| `GET` | `/api/og/:slug` | Public thumbnail card for chat crawlers. |
| `GET` | `/api/og-meta/:slug` | Title, note, file count, thumbnail id for the Vercel OG route. |
| `POST` | `/api/links/:slug/report` | Rate-limited abuse report; 3 reports disable the link. |

## Flows

**Create.** Pick files → client makes light WebP previews → create draft → upload one
file per request → finalize → result shows the exact chat card plus copy, WhatsApp,
email and share actions.

**View.** Crawler hits `/p/:slug` on Vercel and sees title/note/thumbnail tags from the
edge function. The phone loads the SPA, which fetches the file list from the Worker.
Sealed deliveries show a gate; unlock returns a token. The gallery loads previews only;
originals are fetched on download or fullscreen.

**Expiry.** Every request checks `expires_at` and refuses after it. Cron runs every 10
minutes, deletes each expired link's R2 objects by prefix, then deletes the row (FK
cascade removes files and reports).

## Abuse controls

Allowlist by extension and sniffed magic bytes (JPG, PNG, WebP, GIF, PDF), SVG rejected,
25 MB and 15-file caps, sliding-window rate limits per IP hash for create/upload/
password failures/reports, and a report button that disables a link at 3 reports.

## Risks and limits

- Workers Free gives 10 ms CPU per invocation. ZIPs use STORE with streamed entries;
  a full 15 × 25 MB set may need client-side zipping or a paid Worker if it hits the cap.
- `?access=` tokens appear in URLs. They are scoped to one link, expire with it, and the
  client sends `Referrer-Policy: no-referrer`.
- The Vercel OG edge function fetches `/index.html` from its own origin and the metadata
  from the Worker. If the Worker is down, the card falls back to generic copy.
- Node 22.12+ is needed for Wrangler 4; `.nvmrc` pins 22.
