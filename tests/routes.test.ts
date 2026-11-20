import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  likes = new Set<string>();
  accounts = new Map<string, AnyRecord>();
  sessions = new Map<string, AnyRecord>();
  pins = new Map<string, AnyRecord>();
  waitlist = new Set<string>();
  events = new Map<string, AnyRecord>();

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
    if (sql.includes("COUNT(*) AS count FROM likes")) return { count: this.likes.size };
    if (sql.includes("FROM accounts WHERE email")) {
      return [...this.accounts.values()].find((a) => a.email === args[0]) ?? null;
    }
    if (sql.includes("FROM accounts WHERE id")) return this.accounts.get(String(args[0])) ?? null;
    if (sql.includes("FROM sessions WHERE token_hash")) return this.sessions.get(String(args[0])) ?? null;
    if (sql.includes("FROM links WHERE account_id")) {
      const link = [...this.links.values()].find((l) => l.account_id === args[0]);
      if (!link) return null;
      return {
        ...link,
        opens: [...this.events.values()].filter((e) => e.slug === link.slug && e.type === "opened").length,
      };
    }
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
    if (sql.includes("FROM pins WHERE link_slug")) {
      return [...this.pins.values()].filter((p) => p.link_slug === args[0]);
    }
    if (sql.includes("FROM links WHERE account_id")) {
      return [...this.links.values()]
        .filter((l) => l.account_id === args[0])
        .map((link) => ({
          ...link,
          opens: [...this.events.values()].filter((e) => e.slug === link.slug && e.type === "opened").length,
        }));
    }
    if (sql.includes("FROM events") && sql.includes("GROUP BY")) {
      const counts = new Map<string, number>();
      for (const event of this.events.values()) {
        if (event.slug !== args[0]) continue;
        counts.set(String(event.type), (counts.get(String(event.type)) ?? 0) + 1);
      }
      return [...counts.entries()].map(([type, count]) => ({ type, count }));
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
    } else if (sql.startsWith("INSERT OR IGNORE INTO likes")) {
      this.likes.add(String(args[0]));
    } else if (sql.startsWith("INSERT INTO accounts")) {
      this.accounts.set(String(args[0]), {
        id: args[0], email: args[1], password_salt: args[2], password_hash: args[3],
        plan: "free", created_at: args[5],
      });
    } else if (sql.startsWith("INSERT INTO sessions")) {
      this.sessions.set(String(args[0]), { account_id: args[1], expires_at: args[3] });
    } else if (sql.startsWith("INSERT INTO pins")) {
      this.pins.set(String(args[0]), {
        id: args[0], link_slug: args[1], file_id: args[2], x: args[3], y: args[4],
        message: args[5], author: args[6], created_at: args[7],
      });
    } else if (sql.startsWith("INSERT INTO waitlist")) {
      this.waitlist.add(String(args[1]));
    } else if (sql.startsWith("INSERT OR IGNORE INTO events")) {
      const type = String(args[2]);
      const session = args[3] ? String(args[3]) : null;
      const duplicate = type === "opened" && session
        ? [...this.events.values()].some((e) => e.slug === args[1] && e.session_id === session)
        : false;
      if (!duplicate) {
        this.events.set(String(args[0]), { slug: args[1], type, session_id: session, created_at: args[4] });
      }
    } else if (sql.includes("UPDATE links SET account_id")) {
      for (const link of this.links.values()) {
        if (link.owner_token_hash === args[1]) link.account_id = args[0];
      }
    } else if (sql.includes("UPDATE links SET accent_color")) {
      for (const link of this.links.values()) {
        if (link.account_id === args[2]) {
          link.accent_color = args[0];
          link.logo_url = args[1];
        }
      }
    } else if (sql.includes("UPDATE links SET expires_at")) {
      const link = this.links.get(String(args[1]));
      if (link) {
        link.expires_at = args[0];
        link.status = "active";
      }
    } else if (sql.includes("UPDATE links SET status = 'disabled'")) {
      const link = this.links.get(String(args[0]));
      if (link) link.status = "disabled";
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

class MockStorage {
  objects = new Map<string, Uint8Array>();
  private originalFetch = globalThis.fetch;

  install() {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.includes("mock.supabase.co/storage/v1/")) return this.originalFetch(input, init);

      const path = new URL(url).pathname;
      const method = init?.method ?? (typeof input === "string" ? "GET" : input.method);

      if (path.includes("/object/list/")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { prefix?: string };
        const prefix = body.prefix ?? "";
        const names = [...this.objects.keys()]
          .filter((key) => key.startsWith(prefix))
          .map((key) => key.slice(prefix.length));
        return new Response(JSON.stringify(names.map((name) => ({ name }))), { status: 200 });
      }

      const bucketPath = "/storage/v1/object/kelpo-files";
      if (method === "DELETE" && path === bucketPath) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { prefixes?: string[] };
        for (const prefix of body.prefixes ?? []) {
          for (const key of [...this.objects.keys()]) {
            if (key.startsWith(prefix)) this.objects.delete(key);
          }
        }
        return new Response("{}", { status: 200 });
      }

      const key = decodeURIComponent(path.slice(path.indexOf(`${bucketPath}/`) + bucketPath.length + 1));
      if (method === "POST") {
        const bytes = new Uint8Array(await new Response(init?.body as BodyInit).arrayBuffer());
        this.objects.set(key, bytes);
        return new Response("{}", { status: 200 });
      }
      const bytes = this.objects.get(key);
      if (!bytes) return new Response("not found", { status: 404 });
      return new Response(bytes, {
        status: 200,
        headers: { "content-length": String(bytes.byteLength) },
      });
    };
  }

  restore() {
    globalThis.fetch = this.originalFetch;
  }
}

let storage: MockStorage;

beforeEach(() => {
  storage = new MockStorage();
  storage.install();
});

afterEach(() => storage.restore());

function makeEnv() {
  return {
    DB: new FakeDb(),
    APP_URL: "http://localhost:8787",
    PUBLIC_APP_URL: "http://localhost:5173",
    ALLOWED_ORIGIN: "http://localhost:5173,*.vercel.app",
    SESSION_SECRET: "test-secret",
    SUPABASE_URL: "https://mock.supabase.co",
    SUPABASE_SERVICE_KEY: "test-key",
    STORAGE_BUCKET: "kelpo-files",
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
    const { slug, ownerToken } = (await created.json()) as { slug: string; ownerToken: string };
    const ownerHeaders = { "X-Kelpo-Owner": ownerToken };

    const form = new FormData();
    form.append("file", new Blob([pngBytes()], { type: "image/png" }), "cover.png");
    const uploaded = await app.request(
      `/api/links/${slug}/files`,
      { method: "POST", headers: ownerHeaders, body: form },
      env,
    );
    expect(uploaded.status).toBe(201);
    const { id } = (await uploaded.json()) as { id: string };

    const finalized = await app.request(
      `/api/links/${slug}/finalize`,
      { method: "POST", headers: ownerHeaders },
      env,
    );
    expect(finalized.status).toBe(200);
    const finalizedBody = (await finalized.json()) as { url: string; link: { files: unknown[] } };
    expect(finalizedBody.url).toBe(`http://localhost:5173/p/${slug}`);
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

    const meta = await app.request(`/api/og-meta/${slug}`, {}, env);
    expect(meta.status).toBe(200);
    const metaBody = (await meta.json()) as {
      title: string;
      fileCount: number;
      thumbnailId: string | null;
    };
    expect(metaBody.title).toBe("Brand refresh — final files");
    expect(metaBody.fileCount).toBe(1);
    expect(metaBody.thumbnailId).toBe(id);

    const preflight = await app.request(
      "/api/links",
      {
        method: "OPTIONS",
        headers: {
          Origin: "https://kelpo-git-main.vercel.app",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type,x-kelpo-owner",
        },
      },
      env,
    );
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://kelpo-git-main.vercel.app",
    );
    expect(preflight.headers.get("Access-Control-Allow-Headers")).toContain("X-Kelpo-Owner");
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
    const { slug, ownerToken } = (await created.json()) as { slug: string; ownerToken: string };
    const ownerHeaders = { "X-Kelpo-Owner": ownerToken };

    const form = new FormData();
    form.append("file", new Blob([pngBytes()], { type: "image/png" }), "cover.png");
    await app.request(`/api/links/${slug}/files`, { method: "POST", headers: ownerHeaders, body: form }, env);
    await app.request(`/api/links/${slug}/finalize`, { method: "POST", headers: ownerHeaders }, env);

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
    const { accessToken } = (await right.json()) as { accessToken: string };
    const opened = await app.request(
      `/api/links/${slug}`,
      { headers: { "X-Kelpo-Access": accessToken } },
      env,
    );
    expect(opened.status).toBe(200);

    const viaQuery = await app.request(`/api/links/${slug}?access=${accessToken}`, {}, env);
    expect(viaQuery.status).toBe(200);
  });

  it("keeps the sender account optional and adds client notes", async () => {
    const env = makeEnv();
    const created = await app.request(
      "/api/links",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Client delivery", expiry: "7d", hasPassword: false, fileCount: 1 }),
      },
      env,
    );
    const { slug, ownerToken } = (await created.json()) as { slug: string; ownerToken: string };

    const form = new FormData();
    form.append("file", new Blob([pngBytes()], { type: "image/png" }), "cover.png");
    const uploaded = await app.request(
      `/api/links/${slug}/files`,
      { method: "POST", headers: { "X-Kelpo-Owner": ownerToken }, body: form },
      env,
    );
    const { id } = (await uploaded.json()) as { id: string };
    await app.request(`/api/links/${slug}/finalize`, { method: "POST", headers: { "X-Kelpo-Owner": ownerToken } }, env);

    const signup = await app.request(
      "/api/auth/signup",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "studio@example.com", password: "password123", ownerToken }),
      },
      env,
    );
    expect(signup.status).toBe(201);
    const { token } = (await signup.json()) as { token: string };
    const auth = { Authorization: `Bearer ${token}` };

    await app.request(`/api/links/${slug}`, { headers: { "X-Kelpo-Session": "device-one" } }, env);
    await app.request(`/api/links/${slug}`, { headers: { "X-Kelpo-Session": "device-one" } }, env);
    await app.request(`/api/links/${slug}`, { headers: { "X-Kelpo-Session": "device-two" } }, env);

    const stats = await app.request(`/api/links/${slug}/stats`, { headers: auth }, env);
    expect((await stats.json()) as { opens: number }).toEqual({ opens: 2, downloads: 0, zips: 0 });

    const me = await app.request("/api/auth/me", { headers: auth }, env);
    const dashboard = (await me.json()) as { links: Array<{ opens: number }> };
    expect(dashboard.links).toHaveLength(1);
    expect(dashboard.links[0]!.opens).toBe(2);

    const extended = await app.request(
      `/api/links/${slug}/extend`,
      { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ expiry: "30d" }) },
      env,
    );
    expect(extended.status).toBe(200);

    const pin = await app.request(
      `/api/links/${slug}/pins`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: id, x: 40, y: 60, message: "Crop tighter here", author: "Ada" }),
      },
      env,
    );
    expect(pin.status).toBe(201);
    const pins = await app.request(`/api/links/${slug}/pins`, {}, env);
    expect(((await pins.json()) as { pins: unknown[] }).pins).toHaveLength(1);

    const revoked = await app.request(`/api/links/${slug}/revoke`, { method: "POST", headers: auth }, env);
    expect(revoked.status).toBe(200);
  });

  it("counts one like per visitor", async () => {
    const env = makeEnv();
    const first = await app.request("/api/like", { method: "POST" }, env);
    expect((await first.json()) as { count: number }).toEqual({ count: 1 });
    const again = await app.request("/api/like", { method: "POST" }, env);
    expect((await again.json()) as { count: number }).toEqual({ count: 1 });
    const listed = await app.request("/api/like", {}, env);
    expect((await listed.json()) as { count: number }).toEqual({ count: 1 });
  });
});
