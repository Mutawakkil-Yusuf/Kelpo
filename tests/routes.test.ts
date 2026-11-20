import { describe, expect, it } from "vitest";
import { app } from "../src/worker/index";
import type { Env } from "../src/worker/env";

type AnyRecord = Record<string, unknown>;

class FakeStatement {
  constructor(
    private db: FakeDb,
    private sql: string,
    private args: unknown[] = [],
  ) {}

  bind(...args: unknown[]) {
    return new FakeStatement(this.db, this.sql, args);
  }

  async first<T>(): Promise<T | null> {
    return (await this.db.first(this.sql, this.args)) as T | null;
  }

  async all<T>(): Promise<{ results: T[]; success: boolean }> {
    return { results: (await this.db.all(this.sql, this.args)) as T[], success: true };
  }

  async run() {
    return this.db.run(this.sql, this.args);
  }
}

class FakeDb {
  links = new Map<string, AnyRecord>();
  files = new Map<string, AnyRecord>();

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }

  async first(sql: string, args: unknown[]): Promise<unknown> {
    if (sql.includes("FROM links WHERE slug")) return this.links.get(String(args[0])) ?? null;
    if (sql.includes("FROM files WHERE id")) return this.files.get(String(args[0])) ?? null;
    if (sql.includes("COUNT(*) AS count FROM files")) {
      return { count: [...this.files.values()].filter((f) => f.link_slug === args[0]).length };
    }
    if (sql.includes("COUNT(*) AS count FROM rate_events")) return { count: 0 };
    if (sql.includes("SELECT report_count FROM links")) {
      return { report_count: this.links.get(String(args[0]))?.report_count ?? 0 };
    }
    if (sql.includes("FROM files WHERE link_slug") && sql.includes("content_type IN")) {
      return [...this.files.values()].find(
        (f) => f.link_slug === args[0] && String(f.content_type).startsWith("image/"),
      ) ?? null;
    }
    return null;
  }

  async all(sql: string, args: unknown[]): Promise<unknown[]> {
    if (sql.includes("FROM files WHERE link_slug")) {
      return [...this.files.values()]
        .filter((f) => f.link_slug === args[0])
        .sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
    }
    return [];
  }

  async run(sql: string, args: unknown[]) {
    if (sql.startsWith("INSERT INTO links")) {
      this.links.set(String(args[0]), {
        slug: args[0],
        title: args[1],
        message: args[2],
        password_salt: args[3],
        password_hash: args[4],
        owner_token_hash: args[5],
        expected_files: args[6],
        expires_at: args[7],
        created_at: args[8],
        status: "draft",
        view_count: 0,
        report_count: 0,
      });
    } else if (sql.startsWith("INSERT INTO files")) {
      this.files.set(String(args[0]), {
        id: args[0],
        link_slug: args[1],
        r2_key: args[2],
        thumb_key: args[3],
        name: args[4],
        content_type: args[5],
        size_bytes: args[6],
        width: args[7],
        height: args[8],
        sort_order: args[9],
        created_at: args[10],
      });
    } else if (sql.includes("UPDATE links SET status = 'active'")) {
      const link = this.links.get(String(args[0]));
      if (link) link.status = "active";
    } else if (sql.includes("UPDATE links SET view_count")) {
      const link = this.links.get(String(args[0]));
      if (link) link.view_count = Number(link.view_count) + 1;
    }
    return { success: true };
  }
}

class FakeBucket {
  objects = new Map<string, { bytes: Uint8Array }>();

  async put(key: string, value: ArrayBuffer | Uint8Array) {
    this.objects.set(key, {
      bytes: value instanceof Uint8Array ? value : new Uint8Array(value),
    });
  }

  async get(key: string) {
    const object = this.objects.get(key);
    if (!object) return null;
    return {
      size: object.bytes.byteLength,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(object.bytes);
          controller.close();
        },
      }),
    };
  }

  async list({ prefix }: { prefix?: string }) {
    return {
      objects: [...this.objects.keys()]
        .filter((key) => key.startsWith(prefix ?? ""))
        .map((key) => ({ key })),
      truncated: false,
      cursor: undefined,
    };
  }

  async delete(key: string) {
    this.objects.delete(key);
  }
}

function makeEnv() {
  return {
    DB: new FakeDb(),
    FILES: new FakeBucket(),
    ASSETS: {
      fetch: async () =>
        new Response("<!doctype html><html><head><title>Kelpo</title></head><body></body></html>", {
          headers: { "Content-Type": "text/html" },
        }),
    },
    APP_URL: "http://localhost:8787",
    SESSION_SECRET: "test-secret",
  } as unknown as Env;
}

function pngBytes(): Uint8Array {
  const bytes = new Uint8Array(48);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  new DataView(bytes.buffer).setUint32(16, 1200);
  new DataView(bytes.buffer).setUint32(20, 630);
  return bytes;
}

describe("create to download flow", () => {
  it("creates, uploads, seals, previews and downloads originals", async () => {
    const env = makeEnv();

    const created = await app.request(
      "/api/links",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Brand refresh — final files",
          message: "Thanks for the review.",
          expiry: "7d",
          hasPassword: false,
          fileCount: 1,
        }),
      },
      env,
    );
    expect(created.status).toBe(201);
    const { slug } = (await created.json()) as { slug: string };
    const cookie = created.headers.get("Set-Cookie")?.split(";")[0] ?? "";

    const form = new FormData();
    form.append("file", new Blob([pngBytes()], { type: "image/png" }), "cover.png");
    const uploaded = await app.request(
      `/api/links/${slug}/files`,
      { method: "POST", headers: { Cookie: cookie }, body: form },
      env,
    );
    expect(uploaded.status).toBe(201);
    const { id } = (await uploaded.json()) as { id: string };

    const finalized = await app.request(
      `/api/links/${slug}/finalize`,
      { method: "POST", headers: { Cookie: cookie } },
      env,
    );
    expect(finalized.status).toBe(200);
    const finalizedBody = (await finalized.json()) as { url: string; link: { files: unknown[] } };
    expect(finalizedBody.url).toBe(`http://localhost:8787/p/${slug}`);
    expect(finalizedBody.link.files).toHaveLength(1);

    const listing = await app.request(`/api/links/${slug}`, {}, env);
    expect(listing.status).toBe(200);
    const listed = (await listing.json()) as { title: string };
    expect(listed.title).toBe("Brand refresh — final files");

    const download = await app.request(`/api/files/${id}`, {}, env);
    expect(download.status).toBe(200);
    expect(download.headers.get("Content-Disposition")).toContain("attachment");
    expect(download.headers.get("Content-Type")).toBe("application/octet-stream");

    const preview = await app.request(`/api/files/${id}?preview=1`, {}, env);
    expect(preview.status).toBe(200);
    expect(preview.headers.get("Content-Type")).toBe("image/png");

    const zip = await app.request(`/api/links/${slug}/zip`, {}, env);
    expect(zip.status).toBe(200);
    expect(zip.headers.get("Content-Type")).toBe("application/zip");

    const ogPage = await app.request(`/p/${slug}`, {}, env);
    const html = await ogPage.text();
    expect(html).toContain('og:title');
    expect(html).toContain('Brand refresh');
    expect(html).toContain(`/api/og/${slug}`);
  });

  it("keeps password-protected deliveries closed until unlocked", async () => {
    const env = makeEnv();
    const created = await app.request(
      "/api/links",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Sealed set",
          expiry: "24h",
          hasPassword: true,
          password: "correct horse",
          fileCount: 1,
        }),
      },
      env,
    );
    const { slug } = (await created.json()) as { slug: string };
    const cookie = created.headers.get("Set-Cookie")?.split(";")[0] ?? "";

    const form = new FormData();
    form.append("file", new Blob([pngBytes()], { type: "image/png" }), "cover.png");
    await app.request(`/api/links/${slug}/files`, { method: "POST", headers: { Cookie: cookie }, body: form }, env);
    await app.request(`/api/links/${slug}/finalize`, { method: "POST", headers: { Cookie: cookie } }, env);

    expect((await app.request(`/api/links/${slug}`, {}, env)).status).toBe(401);
    const wrong = await app.request(
      `/api/links/${slug}/unlock`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "nope" }),
      },
      env,
    );
    expect(wrong.status).toBe(401);

    const right = await app.request(
      `/api/links/${slug}/unlock`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "correct horse" }),
      },
      env,
    );
    expect(right.status).toBe(200);
    const access = right.headers.get("Set-Cookie")?.split(";")[0] ?? "";
    const opened = await app.request(`/api/links/${slug}`, { headers: { Cookie: access } }, env);
    expect(opened.status).toBe(200);
  });
});
