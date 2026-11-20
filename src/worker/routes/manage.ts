import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env";
import { assertAccess, checkRate, getLink, HttpError, type AppContext } from "../lib/access";
import { getAccount } from "../lib/account";
import { linkCounts } from "../lib/events";
import { generateId, sha256Hex } from "../lib/slug";

const extendSchema = z.object({ expiry: z.enum(["24h", "7d", "30d"]) });
const pinSchema = z.object({
  fileId: z.string().min(1).max(60),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  message: z.string().trim().min(1).max(500),
  author: z.string().trim().min(1).max(80).default("Client"),
});
const LIFETIMES: Record<string, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

/** POST /api/links/:slug/revoke, /extend; GET+POST /:slug/pins; GET /:slug/brand */
const app = new Hono<{ Bindings: Env }>();

async function assertCanManage(c: AppContext, slug: string) {
  const link = await getLink(c.env, slug);
  const owner = c.req.header("X-Kelpo-Owner");
  if (owner && (await sha256Hex(owner)) === link.owner_token_hash) return link;
  try {
    const account = await getAccount(c);
    if (link.account_id === account.id) return link;
  } catch {
    // fall through
  }
  throw new HttpError(403, "You don't have access to this link");
}

app.post("/:slug/revoke", async (c) => {
  const link = await assertCanManage(c, c.req.param("slug"));
  await c.env.DB.prepare("UPDATE links SET status = 'disabled' WHERE slug = ?")
    .bind(link.slug)
    .run();
  return c.json({ ok: true });
});

app.post("/:slug/extend", async (c) => {
  const link = await assertCanManage(c, c.req.param("slug"));
  const { expiry } = extendSchema.parse(await c.req.json());
  const expiresAt = Math.max(link.expires_at, Date.now()) + LIFETIMES[expiry];
  await c.env.DB.prepare(
    "UPDATE links SET expires_at = ?, status = 'active' WHERE slug = ?",
  )
    .bind(expiresAt, link.slug)
    .run();
  return c.json({ expiresAt });
});

app.get("/:slug/stats", async (c) => {
  const link = await assertCanManage(c, c.req.param("slug"));
  return c.json(await linkCounts(c.env, link.slug));
});

app.get("/:slug/brand", async (c) => {
  const link = await getLink(c.env, c.req.param("slug"));
  if (link.status !== "active") throw new HttpError(404, "This link is not available");
  return c.json({ accentColor: link.accent_color, logoUrl: link.logo_url });
});

app.get("/:slug/pins", async (c) => {
  const link = await getLink(c.env, c.req.param("slug"));
  if (link.password_hash) await assertAccess(c, link);
  const pins = await c.env.DB.prepare(
    "SELECT id, file_id, x, y, message, author, created_at FROM pins WHERE link_slug = ? ORDER BY created_at",
  )
    .bind(link.slug)
    .all<{
      id: string;
      file_id: string;
      x: number;
      y: number;
      message: string;
      author: string;
      created_at: number;
    }>();
  return c.json({ pins: pins.results });
});

app.post("/:slug/pins", async (c) => {
  await checkRate(c, "upload", 60, 60 * 60 * 1000);
  const link = await getLink(c.env, c.req.param("slug"));
  if (link.status !== "active" || link.expires_at <= Date.now()) {
    throw new HttpError(410, "This link has ended");
  }
  await assertAccess(c, link);
  const input = pinSchema.parse(await c.req.json());
  const file = await c.env.DB.prepare(
    "SELECT id FROM files WHERE id = ? AND link_slug = ?",
  )
    .bind(input.fileId, link.slug)
    .first();
  if (!file) throw new HttpError(404, "File not found");

  const id = generateId();
  await c.env.DB.prepare(
    "INSERT INTO pins (id, link_slug, file_id, x, y, message, author, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, link.slug, input.fileId, input.x, input.y, input.message, input.author, Date.now())
    .run();
  return c.json({ id }, 201);
});

export default app;
