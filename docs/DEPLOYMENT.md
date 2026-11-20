# Kelpo deployment state (20 Nov 2026)

## Cloudflare — deployed

- Worker: `https://kelpo.mutawakkil280.workers.dev`
- D1 database: `kelpo`, id `5b81a104-ba00-4ea6-830b-b4cd973277c6`, schema applied
- Cron: `*/10 * * * *`
- Secrets set: `SESSION_SECRET`, `SUPABASE_SERVICE_KEY`
- Vars: `APP_URL`, `PUBLIC_APP_URL=https://usekelpo.vercel.app`,
  `ALLOWED_ORIGIN=https://usekelpo.vercel.app,*.vercel.app`,
  `SUPABASE_URL`, `STORAGE_BUCKET=kelpo-files`

Deploy with:
```
cd /root/kelpo
npx -y node@22 node_modules/wrangler/bin/wrangler.js deploy
```

## Supabase — active

- Project: `wuzggadpxpijybqjshhh` (eu-central-1), free tier
- Private bucket: `kelpo-files`, 25 MB file limit, allowlisted MIME types
- Service-role key is a Worker secret; never commit it. `.dev.vars` is gitignored.

Free projects pause after a week of inactivity. When a card is available, enable
Cloudflare R2 and replace `src/worker/lib/storage.ts` with an R2 client to get zero
egress and 10 GB storage.

## Vercel — pending user action

The connected Vercel MCP token belongs to a different account and cannot see or
create `usekelpo`. Import `Mutawakkil-Yusuf/Kelpo` in the Vercel dashboard:

- Framework preset: Vite (from `vercel.json`)
- Build command: `pnpm build`
- Output directory: `web/dist`
- Env vars for production, preview and development:
  - `VITE_API_URL=https://kelpo.mutawakkil280.workers.dev`
  - `KELPO_API_URL=https://kelpo.mutawakkil280.workers.dev`

`/p/:slug` is handled by `api/p/[slug].ts` on Vercel; no rewrite is needed.

## Smoke test already run

Created a link, uploaded a 48-byte PNG, finalized it, downloaded the original and
preview, generated a ZIP, and read `/api/og-meta/:slug` and `/api/og/:slug`. All
returned 200 with the expected content types.
