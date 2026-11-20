/** Shared request guards: link lookup, expiry, password, owner, rate limits.
 *  Auth travels in headers (and in a query token for <img>/<a> requests), not cookies,
 *  so the Worker can live on Cloudflare while the app is served from Vercel. */

import type { Context } from "hono";
import type { Env } from "../env";
import type { FileRow, LinkRow, PublicLink } from "../types";
import { verifyAccessToken } from "./password";
import { hashIp, sha256Hex } from "./slug";

export type AppContext = Context<{ Bindings: Env }>;

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function secret(env: Env): string {
  return env.SESSION_SECRET || env.APP_URL;
}

export function sessionSecret(env: Env): string {
  return secret(env);
}

export async function getLink(env: Env, slug: string): Promise<LinkRow> {
  const link = await env.DB.prepare("SELECT * FROM links WHERE slug = ?")
    .bind(slug)
    .first<LinkRow>();
  if (!link) throw new HttpError(404, "Link not found");
  return link;
}

export async function assertLive(link: LinkRow, env: Env): Promise<void> {
  if (link.status === "draft") throw new HttpError(404, "Link not ready");
  if (link.status === "disabled") throw new HttpError(404, "Link unavailable");
  if (link.expires_at <= Date.now()) {
    await env.DB.prepare("UPDATE links SET status = 'expired' WHERE slug = ? AND status = 'active'")
      .bind(link.slug)
      .run();
    throw new HttpError(410, "This link has ended");
  }
}

export async function assertAccess(c: AppContext, link: LinkRow): Promise<void> {
  if (!link.password_hash) return;
  const token =
    c.req.header("X-Kelpo-Access") || c.req.query("access") || undefined;
  const ok = await verifyAccessToken(token, link.slug, sessionSecret(c.env));
  if (!ok) throw new HttpError(401, "This delivery is sealed");
}

export async function assertOwner(c: AppContext, link: LinkRow): Promise<void> {
  const token = c.req.header("X-Kelpo-Owner");
  if (!token || (await sha256Hex(token)) !== link.owner_token_hash) {
    throw new HttpError(403, "Not your link");
  }
}

export async function getFile(env: Env, id: string): Promise<FileRow> {
  const file = await env.DB.prepare("SELECT * FROM files WHERE id = ?")
    .bind(id)
    .first<FileRow>();
  if (!file) throw new HttpError(404, "File not found");
  return file;
}

export async function checkRate(
  c: AppContext,
  action: "create" | "password_fail" | "report" | "upload" | "like",
  limit: number,
  windowMs: number,
): Promise<void> {
  const ip = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "local";
  const ipHash = await hashIp(ip, sessionSecret(c.env));
  const since = Date.now() - windowMs;
  const row = await c.env.DB.prepare(
    "SELECT COUNT(*) AS count FROM rate_events WHERE ip_hash = ? AND action = ? AND created_at > ?",
  )
    .bind(ipHash, action, since)
    .first<{ count: number }>();
  if ((row?.count ?? 0) >= limit) throw new HttpError(429, "Too many requests. Try again later.");
  await c.env.DB.prepare(
    "INSERT INTO rate_events (ip_hash, action, created_at) VALUES (?, ?, ?)",
  )
    .bind(ipHash, action, Date.now())
    .run();
}

export async function publicLink(env: Env, link: LinkRow): Promise<PublicLink> {
  const rows = await env.DB.prepare(
    "SELECT id, name, content_type, size_bytes, width, height FROM files WHERE link_slug = ? ORDER BY sort_order",
  )
    .bind(link.slug)
    .all<Pick<FileRow, "id" | "name" | "content_type" | "size_bytes" | "width" | "height">>();

  return {
    slug: link.slug,
    title: link.title,
    message: link.message,
    expiresAt: link.expires_at,
    requiresPassword: Boolean(link.password_hash),
    files: rows.results.map((file) => ({
      id: file.id,
      name: file.name,
      contentType: file.content_type,
      sizeBytes: file.size_bytes,
      width: file.width,
      height: file.height,
    })),
  };
}
