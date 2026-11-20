import { Hono } from "hono";
import type { Env } from "../env";
import {
  assertAccess,
  assertLive,
  getFile,
  getLink,
  HttpError,
} from "../lib/access";
import { brandCardPng } from "../lib/og-image";
import { getObject } from "../lib/storage";

/** GET /api/files/:id — inline preview or original download. */
export const fileRoutes = new Hono<{ Bindings: Env }>();

fileRoutes.get("/:id", async (c) => {
  const file = await getFile(c.env, c.req.param("id"));
  const link = await getLink(c.env, file.link_slug);
  await assertLive(link, c.env);
  await assertAccess(c, link);

  const preview = c.req.query("preview") === "1";
  const isPreview = preview && Boolean(file.thumb_key);
  const object = await getObject(c.env, isPreview ? file.thumb_key! : file.r2_key);
  if (!object) throw new HttpError(404, "File is no longer available");

  const filename = encodeURIComponent(file.name);
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
  };
  const size = object.size || file.size_bytes;
  if (size) headers["Content-Length"] = String(size);

  if (isPreview) {
    headers["Content-Type"] = "image/webp";
    headers["Cache-Control"] = "public, max-age=300";
    headers["Content-Disposition"] = `inline; filename="preview.webp"`;
  } else {
    headers["Content-Type"] = preview ? file.content_type : "application/octet-stream";
    headers["Content-Disposition"] = `${preview ? "inline" : "attachment"}; filename*=UTF-8''${filename}`;
    headers["Cache-Control"] = "no-store";
  }

  return new Response(object.body, { headers });
});

async function brandResponse(env: Env): Promise<Response> {
  // The typographic site card is a static asset on the Vite app.
  try {
    const origin = (env.PUBLIC_APP_URL || env.APP_URL).replace(/\/$/, "");
    const site = await fetch(`${origin}/og-home.png`);
    if (site.ok && site.body) {
      return new Response(site.body, {
        headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
      });
    }
  } catch {
    // fall through to the in-process card
  }
  const png = brandCardPng();
  const buffer = new ArrayBuffer(png.length);
  new Uint8Array(buffer).set(png);
  return new Response(new Blob([buffer], { type: "image/png" }), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
  });
}

/** GET /api/og — site card; GET /api/og/:slug — that link's rendered card. */
export const ogRoutes = new Hono<{ Bindings: Env }>();

ogRoutes.get("/", async (c) => brandResponse(c.env));

ogRoutes.get("/:slug", async (c) => {
  const brand = () => brandResponse(c.env);

  try {
    const link = await getLink(c.env, c.req.param("slug"));
    if (link.status !== "active" || link.expires_at <= Date.now()) return brand();

    if (link.og_key) {
      const card = await getObject(c.env, link.og_key);
      if (card) {
        return new Response(card.body, {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=300",
          },
        });
      }
    }

    // Older links without a card fall back to their first image.
    const file = await c.env.DB.prepare(
      `SELECT r2_key, content_type FROM files WHERE link_slug = ?
         AND content_type IN ('image/jpeg', 'image/png', 'image/gif')
       ORDER BY sort_order LIMIT 1`,
    )
      .bind(link.slug)
      .first<{ r2_key: string; content_type: string }>();
    if (!file) return brand();

    const object = await getObject(c.env, file.r2_key);
    if (!object) return brand();
    return new Response(object.body, {
      headers: {
        "Content-Type": file.content_type,
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return brand();
  }
});
