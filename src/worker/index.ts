import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import type { Env } from "./env";
import { HttpError } from "./lib/access";
import { purgeExpired } from "./lib/cleanup";
import createRoutes from "./routes/create";
import { fileRoutes, ogRoutes } from "./routes/file";
import linkRoutes from "./routes/link";
import reportRoutes from "./routes/report";

const app = new Hono<{ Bindings: Env }>();

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

/**
 * Crawler-facing page. The SPA shell is fetched from assets and given real OG tags,
 * so a shared link arrives in chat with the sender's title and a file thumbnail.
 */
app.get("/p/:slug", async (c) => {
  const slug = c.req.param("slug");
  const origin = c.env.APP_URL.replace(/\/$/, "");
  let title = "Kelpo — original quality, delivered";
  let description = "One link. Every file. No compression.";

  try {
    const link = await c.env.DB.prepare("SELECT * FROM links WHERE slug = ?")
      .bind(slug)
      .first<{ title: string; message: string | null; status: string; expires_at: number }>();
    if (link && link.status === "active" && link.expires_at > Date.now()) {
      const count = await c.env.DB.prepare(
        "SELECT COUNT(*) AS count FROM files WHERE link_slug = ?",
      )
        .bind(slug)
        .first<{ count: number }>();
      title = `${link.title} — Kelpo`;
      description = link.message || `${count?.count ?? 0} original files at full quality`;
    }
  } catch {
    // A broken DB still gets a usable chat card.
  }

  const shell = await c.env.ASSETS.fetch(new Request(`${origin}/index.html`));
  const html = (await shell.text()).replace(
    "</head>",
    `<meta property="og:type" content="website" />
     <meta property="og:url" content="${escapeHtml(`${origin}/p/${slug}`)}" />
     <meta property="og:title" content="${escapeHtml(title)}" />
     <meta property="og:description" content="${escapeHtml(description)}" />
     <meta property="og:image" content="${escapeHtml(`${origin}/api/og/${slug}`)}" />
     <meta name="twitter:card" content="summary_large_image" />
     </head>`,
  );

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60",
    },
  });
});

app.route("/api/links", createRoutes);
app.route("/api/links", linkRoutes);
app.route("/api/links", reportRoutes);
app.route("/api/files", fileRoutes);
app.route("/api/og", ogRoutes);

app.get("/*", (c) => c.env.ASSETS.fetch(c.req.raw));

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
