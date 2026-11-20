# Kelpo — roadmap

## MVP (built)

One flow end to end, no accounts:

- [x] Anonymous create on mobile web (pick files, title, note, expiry 24h/7d/30d, optional password)
- [x] Up to 15 files; JPG, PNG, WebP, GIF, PDF; 25 MB per file; type sniffing
- [x] Human-friendly share URL with link preview (og:title, og:description, og:image)
- [x] Client page: gallery, fullscreen viewer, download one, download all as ZIP
- [x] Password gate with signed access cookie
- [x] Automatic deletion of files and rows at expiry (cron + immediate checks)
- [x] Abuse controls: allowlist, rate limiting, report link
- [ ] Deploy to Cloudflare free tier; verify in a real browser on a phone

Explicitly out: accounts/dashboards/history, SVG/PSD/video, pinned feedback, custom
domains, payments, native apps.

## Phase 2 — sender accounts (first slice built)
Optional accounts, link history, view counts, revoke and extend. Links created in the
same browser are claimed at signup via the owner token. Still to do: resumable uploads
for weak networks, "opened" notifications.

## Phase 3 — client feedback (first slice built)
Numbered pins on images with a note and author, no account needed. Still to do: reply
threads, pin editing, email digest for the sender.

## Phase 4 — growth (hooks built)
Brand kit (accent colour and logo) applied to client pages, Studio waitlist. Still to do:
custom domains, real payments, larger file and expiry limits. Storage stays on Supabase
until R2 billing is available.
