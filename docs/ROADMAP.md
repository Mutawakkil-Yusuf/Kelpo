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

## Phase 2 — sender accounts
Link history, revoke and extend, "opened" notifications, resumable uploads for weak
networks. The `owner_token_hash` column exists from MVP so links can be claimed later.

## Phase 3 — client feedback
Numbered pins on designs so clients comment without an account. Overlaps ProofDesk;
could share its annotation layer.

## Phase 4 — growth
Brand kit on the client page (logo, accent colour), custom domains, paid tier with
larger files and longer expiry. Storage stays on R2 — scale by upgrading the Worker
plan and R2 quota, not by migrating vendors.
