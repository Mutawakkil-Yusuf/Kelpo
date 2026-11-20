/** Expired-link purge, batched to stay inside the Workers free CPU budget. */

import type { Env } from "../env";

interface ExpiredLink {
  slug: string;
}

export async function purgeExpired(
  env: Env,
  now: number,
): Promise<{ linksDeleted: number; objectsDeleted: number }> {
  let linksDeleted = 0;
  let objectsDeleted = 0;

  for (let batch = 0; batch < 10; batch++) {
    const rows = await env.DB.prepare(
      "SELECT slug FROM links WHERE status = 'active' AND expires_at <= ? LIMIT 20",
    )
      .bind(now)
      .all<ExpiredLink>();

    if (!rows.results.length) break;

    for (const { slug } of rows.results) {
      let cursor: string | undefined;
      do {
        const listed = await env.FILES.list({ prefix: `links/${slug}/`, cursor });
        for (const object of listed.objects) {
          await env.FILES.delete(object.key);
          objectsDeleted++;
        }
        cursor = listed.truncated ? listed.cursor : undefined;
      } while (cursor);

      // ON DELETE CASCADE removes files and reports with the link.
      await env.DB.prepare("DELETE FROM links WHERE slug = ?").bind(slug).run();
      linksDeleted++;
    }
  }

  return { linksDeleted, objectsDeleted };
}
