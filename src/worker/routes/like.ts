import { Hono } from "hono";
import type { Env } from "../env";
import { checkRate, sessionSecret } from "../lib/access";
import { hashIp } from "../lib/slug";

/** GET /api/like, POST /api/like. One like per visitor. */
const app = new Hono<{ Bindings: Env }>();

async function count(env: Env): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM likes").first<{ count: number }>();
  return row?.count ?? 0;
}

app.get("/", async (c) => c.json({ count: await count(c.env) }));

app.post("/", async (c) => {
  await checkRate(c, "like", 60, 60 * 60 * 1000);
  const ip = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "local";
  const ipHash = await hashIp(ip, sessionSecret(c.env));
  await c.env.DB.prepare("INSERT OR IGNORE INTO likes (ip_hash, created_at) VALUES (?, ?)")
    .bind(ipHash, Date.now())
    .run();
  return c.json({ count: await count(c.env) });
});

export default app;
