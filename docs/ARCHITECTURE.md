# Kelpo — architecture (plan, not yet implemented)

This document describes the intended MVP design. The scaffold in this repo contains
types, config, schema and stubs — no feature logic yet.

## System shape

```
Sender phone                 Client phone (WhatsApp / Instagram / email)
   |                                        |
   | create link + upload                    | open /p/<slug>
   v                                        v
+---------------------------------------------------------------+
|  Cloudflare Worker (Hono)                                     |
|                                                               |
|  /p/:slug        -> HTML shell + per-link OG meta (crawlers)  |
|  /api/*          -> JSON API (create, unlock, files, zip...)   |
|  /api/files/:id  -> stream original from R2, expiry-checked   |
|  scheduled()     -> purge expired links + R2 objects           |
|  static assets   -> built Vite SPA                            |
+---------------------------------------------------------------+
        |                    |
        v                    v
   D1 (metadata)        R2 (originals, private, prefix links/<slug>/)
```

All access to R2 goes through the Worker. The bucket is never public, so expiry and
password checks are enforced on every download, not only after the cron runs.

## Data model (see `migrations/0001_initial.sql`)

- `links` — `slug` (capability token), title, message, optional password salt/hash,
  owner token hash, `expires_at`, status, view/report counters.
- `files` — id, link FK, `r2_key`, original name, MIME type, size, image dimensions,
  sort order.
- `rate_events` — IP hash + action + timestamp; sliding-window abuse checks.
- `reports` — link FK, reason, IP hash.

Slug is a random, URL-safe token (≥16 chars, base58/hex). Knowing it is the primary
capability; the optional password is a second factor. The owner token is a random
secret returned only at create time and stored hashed, so later phases can add revoke
/ extend without accounts.

## API surface (planned)

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/links` | Create link metadata. Body: title, message, expiry, password flag. Returns slug + owner token. |
| `POST` | `/api/links/:slug/files` | Upload one file (multipart, ≤25 MB). Streams to R2 under the link prefix. Validates type by magic bytes. |
| `POST` | `/api/links/:slug/finalize` | Verify all expected objects exist, activate link, compute thumbnail. |
| `GET` | `/api/links/:slug` | Link meta + file list. Requires password session when protected. |
| `POST` | `/api/links/:slug/unlock` | Verify password (PBKDF2), set short-lived signed access cookie. |
| `GET` | `/api/files/:id` | Stream original with `Content-Disposition: attachment`. Checks expiry + access. |
| `GET` | `/api/links/:slug/zip` | Stream all originals as a ZIP (STORE, no re-compression). |
| `GET` | `/api/og/:slug` | Thumbnail for `og:image` (first image, or static branded fallback). |
| `POST` | `/api/links/:slug/report` | Record an abuse report; disable link after a threshold. |
| `GET` | `/p/:slug` | HTML shell with link-specific OG tags for chat crawlers; boots the SPA. |

## Flows

### Create (sender, mobile)
1. Pick up to 15 files; client checks extension/size locally before upload.
2. POST metadata → receive slug + owner token (stored in a cookie).
3. Upload files one by one; each is sniffed and streamed to R2.
4. Finalize → link becomes active; share URL `APP_URL/p/<slug>`.

### View & download (client)
1. WhatsApp/Instagram crawler fetches `/p/:slug` → sees og:title, og:description,
   og:image from the Worker. Link text passes through every chat app.
2. Phone opens URL → SPA fetches `/api/links/:slug`.
3. If password-protected, show unlock screen; success sets a signed cookie.
4. Gallery renders images/PDFs; fullscreen viewer; per-file and "download all (ZIP)".
5. Every file request re-checks `expires_at` and access before streaming from R2.

### Expiry
- Cron runs every 10 minutes: select active links where `expires_at < now`, delete
  their R2 objects, then delete rows (FK cascade handles files/reports).
- Worker also denies access immediately after `expires_at`, so cleanup lag is harmless.
- There is no R2 lifecycle rule: keys are `links/<slug>/...` for every expiry, so
  exact per-link deletion is done by cron.

## Abuse controls
- Allowlist by extension **and** sniffed MIME (JPG, PNG, WebP, GIF, PDF only).
- Reject SVG outright (script risk) and anything over 25 MB / 15 files.
- Sliding-window rate limits per IP hash for create, password failures, and reports.
- Report endpoint; threshold disables a link (sets status, drops it from lookups).

## Key risks / open questions
- **ZIP on free Workers CPU:** STORE avoids compression cost, but a 375 MB ZIP may
  still stress the 10 ms budget. If so: generate the ZIP client-side with `fflate`
  reading from signed per-file URLs, or generate once at finalize time.
- **Magic-byte sniffing** of WebP/GIF/PDF needs a small, tested detector; PDFs can
  claim many MIME types. Keep the detector isolated in `lib/validate.ts`.
- **Password UX** on a phone: keep the unlock form minimal and remember the signed
  cookie for the link's lifetime.
- **OG images** must be publicly fetchable by chat crawlers (no cookie); serve from a
  dedicated `/api/og/:slug` route with a plain image response.
- **Nigerian mobile data:** serve thumbnails for the gallery and only fetch originals
  on download/fullscreen; keep the SPA bundle small.

## Local development
`wrangler dev` emulates D1, R2 and cron locally. Run Vite for HMR and proxy `/api` to
the Worker, or build the SPA and let the Worker serve `web/dist`. See README.
