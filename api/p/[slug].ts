/** Vercel edge function: serves the SPA shell with real chat-preview tags.
 *  The Worker holds the metadata; this function only writes it into <head>. */

declare const process: { env: Record<string, string | undefined> };

export const config = { runtime: "edge" };

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

interface OgMeta {
  title?: string;
  message?: string | null;
  fileCount?: number;
  expiresAt?: number;
  thumbnailId?: string | null;
}

export default async function handler(
  request: Request,
  context?: { params?: { slug?: string } },
): Promise<Response> {
  // Vercel's rewrite keeps the path but may not populate route params.
  const fromPath = new URL(request.url).pathname.split("/").filter(Boolean).pop() ?? "";
  const slug = decodeURIComponent(context?.params?.slug || fromPath);
  const api = (process.env.KELPO_API_URL || process.env.VITE_API_URL || "http://localhost:8787").replace(/\/$/, "");
  const origin = new URL(request.url).origin;

  let title = "Kelpo — original quality, delivered";
  let description = "One link. Every file. No compression.";

  try {
    const response = await fetch(`${api}/api/og-meta/${encodeURIComponent(slug)}`);
    if (response.ok) {
      const meta = (await response.json()) as OgMeta;
      if (meta.title) {
        title = `${meta.title} — Kelpo`;
        description = meta.message || `${meta.fileCount ?? 0} original files at full quality`;
      }
    }
  } catch {
    // The card still works with generic copy if the API is down.
  }

  const image = `${api}/api/og/${encodeURIComponent(slug)}`;
  const tags = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${escapeHtml(`${origin}/p/${slug}`)}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:image" content="${escapeHtml(image)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="referrer" content="no-referrer">`,
  ].join("\n");

  const shell = await fetch(new URL("/index.html", request.url));
  let html = await shell.text();
  // The built shell has site-wide tags; a link page must not carry two sets.
  html = html.replace(/<meta (?:property|name)="(?:og:|twitter:)[^"]*"[^>]*>/g, "");
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`);
  html = html.replace("</head>", `${tags}\n</head>`);

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      "Referrer-Policy": "no-referrer",
    },
  });
}
