import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env";
import { checkRate, HttpError } from "../lib/access";
import {
  authenticate,
  createSession,
  getAccount,
  newId,
  publicAccount,
} from "../lib/account";
import { hashPassword } from "../lib/password";
import { sha256Hex } from "../lib/slug";

const signupSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(128),
  ownerToken: z.string().optional(),
});
const loginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(128),
});

/** POST /api/auth/signup, /api/auth/login, GET /api/auth/me, POST /api/auth/brand */
const app = new Hono<{ Bindings: Env }>();

app.post("/signup", async (c) => {
  await checkRate(c, "auth", 100, 60 * 60 * 1000);
  const input = signupSchema.parse(await c.req.json());
  const email = input.email.toLowerCase();
  const existing = await c.env.DB.prepare("SELECT id FROM accounts WHERE email = ?")
    .bind(email)
    .first();
  if (existing) throw new HttpError(409, "That email already has an account");

  const password = await hashPassword(input.password);
  const id = newId();
  await c.env.DB.prepare(
    "INSERT INTO accounts (id, email, password_salt, password_hash, plan, created_at) VALUES (?, ?, ?, ?, 'free', ?)",
  )
    .bind(id, email, password.salt, password.hash, Date.now())
    .run();

  if (input.ownerToken) {
    const ownerHash = await sha256Hex(input.ownerToken);
    await c.env.DB.prepare("UPDATE links SET account_id = ? WHERE owner_token_hash = ?")
      .bind(id, ownerHash)
      .run();
  }

  const token = await createSession(c.env, id);
  return c.json({ token, account: { id, email, plan: "free" } }, 201);
});

app.post("/login", async (c) => {
  await checkRate(c, "password_fail", 12, 15 * 60 * 1000);
  const input = loginSchema.parse(await c.req.json());
  const account = await authenticate(c, input.email, input.password);
  const token = await createSession(c.env, account.id);
  return c.json({ token, account: publicAccount(account) });
});

app.get("/me", async (c) => {
  const account = await getAccount(c);
  const links = await c.env.DB.prepare(
    `SELECT slug, title, status, expires_at, created_at, view_count, report_count
       FROM links WHERE account_id = ? ORDER BY created_at DESC LIMIT 100`,
  )
    .bind(account.id)
    .all<{
      slug: string;
      title: string;
      status: string;
      expires_at: number;
      created_at: number;
      view_count: number;
      report_count: number;
    }>();

  const brand = await c.env.DB.prepare(
    "SELECT accent_color, logo_url FROM links WHERE account_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1",
  )
    .bind(account.id)
    .first<{ accent_color: string | null; logo_url: string | null }>();

  return c.json({
    account: publicAccount(account),
    links: links.results,
    brand: {
      accentColor: brand?.accent_color ?? null,
      logoUrl: brand?.logo_url ?? null,
    },
  });
});

app.post("/brand", async (c) => {
  const account = await getAccount(c);
  const input = z
    .object({
      accentColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .nullable(),
      logoUrl: z.string().url().max(500).nullable(),
    })
    .parse(await c.req.json());
  await c.env.DB.prepare(
    "UPDATE links SET accent_color = ?, logo_url = ? WHERE account_id = ?",
  )
    .bind(input.accentColor, input.logoUrl, account.id)
    .run();
  return c.json({ ok: true });
});

app.post("/waitlist", async (c) => {
  await checkRate(c, "auth", 100, 60 * 60 * 1000);
  const { email } = z.object({ email: z.string().trim().email().max(200) }).parse(await c.req.json());
  await c.env.DB.prepare("INSERT INTO waitlist (id, email, created_at) VALUES (?, ?, ?)")
    .bind(newId(), email.toLowerCase(), Date.now())
    .run();
  return c.json({ ok: true });
});

export default app;
