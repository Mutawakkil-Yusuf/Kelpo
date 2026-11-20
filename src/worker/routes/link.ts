import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env";
import {
  assertAccess,
  assertLive,
  checkRate,
  getLink,
  HttpError,
  publicLink,
  sessionSecret,
} from "../lib/access";
import { signAccessToken, verifyPassword } from "../lib/password";
import { getObject } from "../lib/storage";
import { safeFileName } from "../lib/validate";
import { createZipBuilder, zipHeaders } from "../lib/zip";
import type { FileRow } from "../types";

const unlockSchema = z.object({ password: z.string().min(1).max(128) });

/** GET /api/links/:slug, POST /api/links/:slug/unlock, GET /api/links/:slug/zip */
const app = new Hono<{ Bindings: Env }>();

app.get("/:slug", async (c) => {
  const link = await getLink(c.env, c.req.param("slug"));
  await assertLive(link, c.env);
  await assertAccess(c, link);

  await c.env.DB.prepare("UPDATE links SET view_count = view_count + 1 WHERE slug = ?")
    .bind(link.slug)
    .run();

  const payload = await publicLink(c.env, link);
  c.header("Cache-Control", "no-store");
  return c.json(payload);
});

app.post("/:slug/unlock", async (c) => {
  await checkRate(c, "password_fail", 12, 15 * 60 * 1000);
  const link = await getLink(c.env, c.req.param("slug"));
  await assertLive(link, c.env);

  const { password } = unlockSchema.parse(await c.req.json());
  if (!link.password_hash || !link.password_salt) {
    throw new HttpError(400, "This delivery is not sealed");
  }
  const ok = await verifyPassword(password, {
    salt: link.password_salt,
    hash: link.password_hash,
  });
  if (!ok) throw new HttpError(401, "That password is not right");

  const accessToken = await signAccessToken(
    link.slug,
    sessionSecret(c.env),
    Math.min(link.expires_at, Date.now() + 30 * 24 * 60 * 60 * 1000),
  );
  return c.json({ ok: true, accessToken });
});

app.get("/:slug/zip", async (c) => {
  const link = await getLink(c.env, c.req.param("slug"));
  await assertLive(link, c.env);
  await assertAccess(c, link);

  const files = await c.env.DB.prepare(
    "SELECT * FROM files WHERE link_slug = ? ORDER BY sort_order",
  )
    .bind(link.slug)
    .all<FileRow>();

  const builder = createZipBuilder();
  let index = 0;
  for (const file of files.results) {
    const object = await getObject(c.env, file.r2_key);
    if (!object) continue;
    index++;
    const name = `${String(index).padStart(2, "0")}-${safeFileName(file.name)}`;
    await builder.add(name, object.body);
  }
  builder.end();

  const label = safeFileName(link.title).replace(/\.+$/, "") || "kelpo";
  return new Response(builder.stream, {
    headers: zipHeaders(label),
  });
});

export default app;
