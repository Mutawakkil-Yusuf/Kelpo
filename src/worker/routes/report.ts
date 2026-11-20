import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env";
import { checkRate, getLink, HttpError, sessionSecret } from "../lib/access";
import { hashIp } from "../lib/slug";

const reportSchema = z.object({
  reason: z.enum(["spam", "harmful", "stolen", "other"]),
});

/** POST /api/links/:slug/report */
const app = new Hono<{ Bindings: Env }>();

app.post("/:slug/report", async (c) => {
  await checkRate(c, "report", 5, 60 * 60 * 1000);
  const link = await getLink(c.env, c.req.param("slug"));
  if (link.status !== "active") throw new HttpError(404, "Link unavailable");

  const { reason } = reportSchema.parse(await c.req.json());
  const ip = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "local";
  const ipHash = await hashIp(ip, sessionSecret(c.env));

  await c.env.DB.prepare(
    "INSERT INTO reports (id, link_slug, reason, ip_hash, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), link.slug, reason, ipHash, Date.now())
    .run();

  await c.env.DB.prepare(
    "UPDATE links SET report_count = report_count + 1 WHERE slug = ?",
  )
    .bind(link.slug)
    .run();
  const updated = await c.env.DB.prepare(
    "SELECT report_count FROM links WHERE slug = ?",
  )
    .bind(link.slug)
    .first<{ report_count: number }>();

  if ((updated?.report_count ?? 0) >= 3) {
    await c.env.DB.prepare("UPDATE links SET status = 'disabled' WHERE slug = ?")
      .bind(link.slug)
      .run();
  }

  return c.json({ ok: true });
});

export default app;
