# Kelpo — tech decisions (researched 20 Nov 2026)

## The question

Kelpo's dominant cost is **egress**: a designer uploads originals once, but every client
downloads them on mobile data. The app must stay free to run at MVP scale, survive
spiky usage, and have a clean paid path. The brief proposes Supabase-like storage and a
"move to R2 if download costs grow" — but the research below suggests starting on R2.

## Free-tier comparison (official pricing pages, checked 20 Nov 2026)

| Service | Free allowance | What it means for Kelpo | Verdict |
| --- | --- | --- | --- |
| **Cloudflare R2** | 10 GB-month storage, 1M Class A ops/mo, 10M Class B ops/mo, **egress always free** (via Workers, S3 API or `r2.dev`) | 15 × 25 MB = 375 MB per link. ~25 full links fit in 10 GB. Downloads cost nothing. Deletes are free ops. | **Use for originals** |
| **Cloudflare Workers** | 100,000 requests/day, 10 ms CPU per invocation, static assets free & unlimited | API, OG injection, cron, and SPA hosting all on one platform. No cold starts. | **Use for app + API** |
| **Cloudflare D1** | 5M rows read/day, 100k rows written/day, 5 GB storage, 10 databases, no egress charge | Link/file/report/rate-limit metadata is tiny; free tier is far beyond MVP needs. | **Use for metadata** |
| **Cloudflare Cron Triggers** | Included on Workers Free (5 crons/account); `scheduled()` handler | Exact-expiry cleanup of rows + objects. Test with `wrangler dev`. | **Use for expiry** |
| Supabase Free | 500 MB DB, **1 GB file storage**, **5 GB egress**, 50 MB max upload, 500k edge fn invocations, 2 active projects, projects pause after 1 week idle | Viable, but 5 GB egress is the binding constraint: one 375 MB link opened by 14 clients exhausts a month. 1 GB storage ~= 2–3 links. Pausing is bad for sporadic creator use. | Fallback only |
| Vercel Hobby | 1M CDN requests, 100 GB data transfer, 1M function invocations, Blob 1 GB storage / 10 GB transfer, cron included | Great app host, but Blob storage/transfer is tighter than R2; pairing Vercel + R2 = two vendors. | Alternative app host |
| Cloudflare KV | 1 GB stored, 100k reads/day, **1k writes/day** | Writes too scarce for per-link state; D1 is better here. | Don't use |

## Recommendation

**Build Kelpo on the free tiers, split across two platforms:**

- **Vercel** — Vite + React app, plus a small edge function at `/p/:slug` that writes
  chat-preview tags into the SPA shell. A plain `.vercel.app` domain is enough.
- **Cloudflare Workers** (with Hono) — API, CORS, OG thumbnail, cron handler.
- **D1** (SQLite at the edge) — links, files, rate-limit events, reports.
- **R2** — original files, private bucket, all reads/writes through the Worker.
- **Cron Trigger** — delete expired rows and their R2 objects.

Everything runs locally with `wrangler dev` and `vite`, with no Cloudflare account or
credentials. Deploy the Worker with `wrangler deploy` and import the repo in Vercel.

### Why the split works on `.vercel.app`

No cookies are used. Cross-site cookies would need `SameSite=None` and would be blocked
by Safari; instead the owner token travels in `X-Kelpo-Owner` and the password token in
`X-Kelpo-Access` (or `?access=` for images and downloads). CORS allows the exact Vercel
origin plus `*.vercel.app` previews, so no custom domain is required. A custom domain
under one registrable domain would be the alternative if we wanted first-party cookies.

### Why not Supabase Storage

Egress is the product's cost centre, and Supabase's 5 GB included egress is small for
original-quality downloads. Upgrading removes that risk but adds cost; R2's free tier
removes it from day one. Supabase Free also pauses inactive projects for a week, which
fits poorly with a tool used per-project rather than daily.

### Why not "move to R2 later" (from the brief)

R2 is free now, has no egress charge, and its paid rates are cheap ($0.015/GB-month,
$0.36/M class-B ops). Starting there avoids a migration later and directly satisfies
the brief's cost concern.

### Why not Next.js on Workers

`@opennextjs/cloudflare` can run Next.js on Workers, but it adds build/runtime
complexity for an app whose routing needs are modest. A Vite SPA plus a Hono Worker is
smaller, easier to reason about, and makes the per-link OG injection explicit. If you
strongly prefer Next.js, the fallback is **Next.js on Vercel Hobby + R2** — same data
layer, no architecture change to storage or DB.

### Storage while billing is unavailable

Cloudflare requires a payment method on file before R2 can be enabled, even on the
free tier. Until a card is added, originals go to a free Supabase Storage bucket
(1 GB storage, 5 GB egress, no card). D1 still holds metadata. The Worker talks to
Supabase over its Storage REST API through `src/worker/lib/storage.ts`, so moving
back to R2 later means replacing that one module.

Alternatives checked: Tigris (5 GB, zero egress, no card) needs a new account;
Vercel Blob (1 GB / 10 GB transfer) needs project creation rights the current token
does not have; Firebase Storage and Backblaze B2 both need a payment method.

## Constraints discovered (design must respect these)

1. **Workers Free = 10 ms CPU per invocation.** Don't buffer or re-compress files.
   Stream R2 objects; generate ZIPs with `fflate` using STORE (no compression) since
   JPG/PNG/WebP/GIF/PDF are already compressed. Batch cron deletions.
2. **Don't upload 15 files in one multipart request** (375 MB exceeds Workers' request
   body limit and 128 MB memory). Create link metadata first, then upload **one file
   per request** (≤25 MB), then finalize.
3. **D1 free = 100k writes/day.** Fine: each link costs ~16 writes, so ~6k links/day
   before hitting the cap. Index `expires_at` so cleanup scans few rows.
4. **Cron + request-time checks:** a 10-minute Cron Trigger deletes R2 objects and
   D1 rows, and every file/OG request re-checks `expires_at`. Cleanup lag is
   harmless. R2 lifecycle rules would need expiry-specific key prefixes, so they
   are deliberately left out of the MVP.

## Sources

- https://supabase.com/pricing
- https://developers.cloudflare.com/r2/pricing/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/workers/configuration/cron-triggers/
- https://vercel.com/pricing
