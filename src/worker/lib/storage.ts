/** Object storage over Supabase Storage's REST API. Metadata stays in D1.
 *  Supabase free has no card requirement; R2 can be restored later by swapping
 *  this module when billing is available. */

import type { Env } from "../env";

export interface StoredObject {
  body: ReadableStream<Uint8Array>;
  size: number;
  contentType: string | null;
}

function authHeaders(env: Env): Record<string, string> {
  return {
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    apikey: env.SUPABASE_SERVICE_KEY,
  };
}

function objectUrl(env: Env, key: string): string {
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `${env.SUPABASE_URL}/storage/v1/object/${env.STORAGE_BUCKET}/${path}`;
}

export async function putObject(
  env: Env,
  key: string,
  data: ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<void> {
  let body: ArrayBuffer;
  if (data instanceof Uint8Array) {
    body = new ArrayBuffer(data.byteLength);
    new Uint8Array(body).set(data);
  } else {
    body = data;
  }

  const response = await fetch(objectUrl(env, key), {
    method: "POST",
    headers: {
      ...authHeaders(env),
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body,
  });
  if (!response.ok) throw new Error("STORAGE_UPLOAD_FAILED");
}

export async function getObject(env: Env, key: string): Promise<StoredObject | null> {
  const response = await fetch(objectUrl(env, key), { headers: authHeaders(env) });
  if (!response.ok || !response.body) return null;
  return {
    body: response.body,
    size: Number(response.headers.get("content-length") ?? 0),
    contentType: response.headers.get("content-type"),
  };
}

export async function deleteObjects(env: Env, keys: string[]): Promise<void> {
  if (!keys.length) return;
  const response = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/${env.STORAGE_BUCKET}`,
    {
      method: "DELETE",
      headers: { ...authHeaders(env), "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: keys }),
    },
  );
  if (!response.ok) throw new Error("STORAGE_DELETE_FAILED");
}

export async function listObjects(env: Env, prefix: string): Promise<string[]> {
  const response = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/list/${env.STORAGE_BUCKET}`,
    {
      method: "POST",
      headers: { ...authHeaders(env), "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: 100, offset: 0 }),
    },
  );
  if (!response.ok) throw new Error("STORAGE_LIST_FAILED");
  const rows = (await response.json()) as Array<{ name: string }>;
  return rows.map((row) => `${prefix}${row.name}`);
}
