/** Funnel events in D1. No SDK, no cookies, no third-party calls. */

import type { Env } from "../env";
import { generateId } from "./slug";

export type EventType =
  | "created"
  | "uploaded"
  | "finalized"
  | "opened"
  | "downloaded"
  | "previewed"
  | "zipped";

export async function record(
  env: Env,
  slug: string,
  type: EventType,
  sessionId?: string | null,
): Promise<void> {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO events (id, slug, type, session_id, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(generateId(), slug, type, sessionId ?? null, Date.now())
    .run();
}

export async function linkCounts(
  env: Env,
  slug: string,
): Promise<{ opens: number; downloads: number; zips: number }> {
  const rows = await env.DB.prepare(
    "SELECT type, COUNT(*) AS count FROM events WHERE slug = ? AND type IN ('opened','downloaded','zipped') GROUP BY type",
  )
    .bind(slug)
    .all<{ type: string; count: number }>();
  const result = { opens: 0, downloads: 0, zips: 0 };
  for (const row of rows.results) {
    if (row.type === "opened") result.opens = row.count;
    if (row.type === "downloaded") result.downloads = row.count;
    if (row.type === "zipped") result.zips = row.count;
  }
  return result;
}
