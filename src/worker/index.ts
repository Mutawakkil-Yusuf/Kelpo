import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import type { Env } from "./env";
import { getLink, HttpError } from "./lib/access";
import { purgeExpired } from "./lib/cleanup";
import authRoutes from "./routes/auth";
import createRoutes from "./routes/create";
import { fileRoutes, ogRoutes } from "./routes/file";
import likeRoutes from "./routes/like";
import linkRoutes from "./routes/link";
import manageRoutes from "./routes/manage";
import reportRoutes from "./routes/report";

const app = new Hono<{ Bindings: Env }>();

app.use(
  "/api/*",
  cors({
    origin: (origin, c) => {
      const allowed = (c.env.ALLOWED_ORIGIN || "")
        .split(",")
        .map((value: string) => value.trim())
        .filter(Boolean);
      if (!allowed.length) return origin || "*";
      const match = allowed.find(
        (rule: string) =>
          rule === "*" ||
          rule === origin ||
          (rule.startsWith("*.") && origin.endsWith(rule.slice(1))),
      );
      if (!match) return allowed[0];
      if (match === "*" || match.startsWith("*.")) return origin;
      return match;
    },
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "X-Kelpo-Owner",
      "X-Kelpo-Access",
      "X-Kelpo-Session",
    ],
    allowMethods: ["GET", "POST", "OPTIONS"],
    maxAge: 600,
  }),
);

/**
 * Public metadata for the Vercel edge function that writes og: tags. It carries
 * no file names, password state or owner token. Only what a chat card shows.
 */
app.get("/api/og-meta/:slug", async (c) => {
  const fallback = {
    title: "Kelpo. Original files, one link.",
    message: null,
    fileCount: 0,
    expiresAt: 0,
    thumbnailId: null,
  };
  try {
    const link = await getLink(c.env, c.req.param("slug"));
    if (link.status !== "active" || link.expires_at <= Date.now()) {
      return c.json(fallback);
    }
    const count = await c.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM files WHERE link_slug = ?",
    )
      .bind(link.slug)
      .first<{ count: number }>();
    const thumbnail = await c.env.DB.prepare(
      `SELECT id FROM files WHERE link_slug = ?
         AND content_type IN ('image/jpeg', 'image/png', 'image/gif')
       ORDER BY sort_order LIMIT 1`,
    )
      .bind(link.slug)
      .first<{ id: string }>();
    return c.json({
      title: link.title,
      message: link.message,
      fileCount: count?.count ?? 0,
      expiresAt: link.expires_at,
      thumbnailId: thumbnail?.id ?? null,
    });
  } catch {
    return c.json(fallback);
  }
});

app.route("/api/links", createRoutes);
app.route("/api/links", linkRoutes);
app.route("/api/links", reportRoutes);
app.route("/api/links", manageRoutes);
app.route("/api/auth", authRoutes);
app.route("/api/like", likeRoutes);
app.route("/api/files", fileRoutes);
app.route("/api/og", ogRoutes);

const errorMessages: Record<string, string> = {
  UNSUPPORTED_TYPE: "Only JPG, PNG, WebP, GIF and PDF files are allowed",
  TYPE_EXTENSION_MISMATCH: "The file contents do not match its extension",
  FILE_TOO_LARGE: "Each file must be 25 MB or less",
};

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json({ error: err.message }, err.status as ContentfulStatusCode);
  }
  if (err instanceof z.ZodError) {
    return c.json({ error: "Check the details you entered", issues: err.issues }, 400);
  }
  if (err instanceof SyntaxError) return c.json({ error: "Invalid request" }, 400);
  if (err.message in errorMessages) {
    return c.json({ error: errorMessages[err.message] }, 400);
  }
  console.error(err);
  return c.json({ error: "Something went wrong" }, 500);
});

export { app };

export default {
  fetch: app.fetch,
  async scheduled(_controller, env: Env, _ctx) {
    await purgeExpired(env, Date.now());
  },
} satisfies ExportedHandler<Env>;
