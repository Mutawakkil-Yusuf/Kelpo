import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env";
import { assertOwner, checkRate, getLink, HttpError, publicLink } from "../lib/access";
import { hashPassword } from "../lib/password";
import { putObject } from "../lib/storage";
import { generateId, generateOwnerToken, generateSlug, sha256Hex } from "../lib/slug";
import {
  assertFileAllowed,
  MAX_FILE_BYTES,
  MAX_FILES_PER_LINK,
  safeFileName,
  sniffFileType,
} from "../lib/validate";
import type { PublicLink } from "../types";

const LIFETIMES: Record<string, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

const createSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    message: z.string().trim().max(600).optional(),
    expiry: z.enum(["24h", "7d", "30d"]),
    hasPassword: z.boolean(),
    password: z.string().min(6).max(128).optional(),
    fileCount: z.number().int().min(1).max(MAX_FILES_PER_LINK),
  })
  .refine((value) => !value.hasPassword || (value.password?.length ?? 0) >= 6, {
    message: "Password must be at least 6 characters",
  });

/** POST /api/links, /api/links/:slug/files, /api/links/:slug/finalize */
const app = new Hono<{ Bindings: Env }>();

app.post("/", async (c) => {
  await checkRate(c, "create", 100, 60 * 60 * 1000);
  const input = createSchema.parse(await c.req.json());

  const slug = generateSlug();
  const ownerToken = generateOwnerToken();
  const ownerTokenHash = await sha256Hex(ownerToken);
  const now = Date.now();
  const expiresAt = now + LIFETIMES[input.expiry];
  const password = input.hasPassword ? await hashPassword(input.password!) : null;

  await c.env.DB.prepare(
    `INSERT INTO links
       (slug, title, message, password_salt, password_hash, owner_token_hash,
        expected_files, expires_at, created_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
  )
    .bind(
      slug,
      input.title,
      input.message || null,
      password?.salt ?? null,
      password?.hash ?? null,
      ownerTokenHash,
      input.fileCount,
      expiresAt,
      now,
    )
    .run();

  return c.json({ slug, expiresAt, ownerToken }, 201);
});

app.post("/:slug/files", async (c) => {
  const link = await getLink(c.env, c.req.param("slug"));
  await assertOwner(c, link);
  if (link.status !== "draft") throw new HttpError(409, "Link is already sealed");
  await checkRate(c, "upload", 300, 60 * 60 * 1000);

  const count = await c.env.DB.prepare(
    "SELECT COUNT(*) AS count FROM files WHERE link_slug = ?",
  )
    .bind(link.slug)
    .first<{ count: number }>();
  if ((count?.count ?? 0) >= Math.min(link.expected_files, MAX_FILES_PER_LINK)) {
    throw new HttpError(400, "All files have been added");
  }

  const form = await c.req.formData();
  const uploaded = form.get("file");
  if (!uploaded || typeof uploaded === "string") {
    throw new HttpError(400, "No file supplied");
  }
  const file = uploaded as File;
  assertFileAllowed(file.name, file.size);

  const head = new Uint8Array(await file.slice(0, 24).arrayBuffer());
  const sniffed = sniffFileType(head, file.name);

  const thumbnail = form.get("thumb");
  const thumbBytes =
    thumbnail && typeof thumbnail !== "string" ? await (thumbnail as File).arrayBuffer() : null;
  if (thumbBytes && thumbBytes.byteLength > MAX_FILE_BYTES) {
    throw new HttpError(400, "Preview too large");
  }

  const id = generateId();
  const r2Key = `${link.slug}/${id}-${safeFileName(file.name)}`;
  const thumbKey = thumbBytes ? `${link.slug}/${id}-thumb.webp` : null;

  await putObject(c.env, r2Key, await file.arrayBuffer(), sniffed.contentType);
  if (thumbKey && thumbBytes) {
    await putObject(c.env, thumbKey, thumbBytes, "image/webp");
  }

  const ogPart = form.get("og");
  if (ogPart && typeof ogPart !== "string" && (ogPart as File).size > 0) {
    const ogKey = `${link.slug}/og-card.png`;
    await putObject(c.env, ogKey, await (ogPart as File).arrayBuffer(), "image/png");
    await c.env.DB.prepare("UPDATE links SET og_key = ? WHERE slug = ?")
      .bind(ogKey, link.slug)
      .run();
  }

  await c.env.DB.prepare(
    `INSERT INTO files
       (id, link_slug, r2_key, thumb_key, name, content_type, size_bytes, width, height, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      link.slug,
      r2Key,
      thumbKey,
      file.name,
      sniffed.contentType,
      file.size,
      sniffed.width,
      sniffed.height,
      count?.count ?? 0,
      Date.now(),
    )
    .run();

  return c.json(
    { id, name: file.name, sizeBytes: file.size, contentType: sniffed.contentType },
    201,
  );
});

app.post("/:slug/finalize", async (c) => {
  const link = await getLink(c.env, c.req.param("slug"));
  await assertOwner(c, link);
  if (link.status !== "draft") throw new HttpError(409, "Link is already sealed");

  const count = await c.env.DB.prepare(
    "SELECT COUNT(*) AS count FROM files WHERE link_slug = ?",
  )
    .bind(link.slug)
    .first<{ count: number }>();
  if (!count?.count) throw new HttpError(400, "Add at least one file");

  await c.env.DB.prepare("UPDATE links SET status = 'active' WHERE slug = ?")
    .bind(link.slug)
    .run();

  const fresh = await getLink(c.env, link.slug);
  const payload: PublicLink = await publicLink(c.env, fresh);
  const appOrigin = (c.env.PUBLIC_APP_URL || c.env.APP_URL).replace(/\/$/, "");
  return c.json({
    url: `${appOrigin}/p/${link.slug}`,
    link: payload,
  });
});

export default app;
