/** Session auth for sender accounts. Tokens travel in Authorization headers, not cookies. */

import type { Context } from "hono";
import type { Env } from "../env";
import { HttpError, type AppContext } from "./access";
import { verifyPassword } from "./password";
import { generateId, randomToken, sha256Hex } from "./slug";

export interface AccountRow {
  id: string;
  email: string;
  password_salt: string;
  password_hash: string;
  plan: string;
  created_at: number;
}

export async function createSession(env: Env, accountId: string): Promise<string> {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  )
    .bind(tokenHash, accountId, now, now + 30 * 24 * 60 * 60 * 1000)
    .run();
  return token;
}

export async function getAccount(c: AppContext): Promise<AccountRow> {
  const header = c.req.header("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new HttpError(401, "Sign in to continue");
  const tokenHash = await sha256Hex(token);
  const session = await c.env.DB.prepare(
    "SELECT account_id, expires_at FROM sessions WHERE token_hash = ?",
  )
    .bind(tokenHash)
    .first<{ account_id: string; expires_at: number }>();
  if (!session || session.expires_at <= Date.now()) throw new HttpError(401, "Session expired");
  const account = await c.env.DB.prepare("SELECT * FROM accounts WHERE id = ?")
    .bind(session.account_id)
    .first<AccountRow>();
  if (!account) throw new HttpError(401, "Sign in to continue");
  return account;
}

export function publicAccount(account: AccountRow) {
  return { id: account.id, email: account.email, plan: account.plan };
}

export async function authenticate(
  c: Context<{ Bindings: Env }>,
  email: string,
  password: string,
): Promise<AccountRow> {
  const account = await c.env.DB.prepare("SELECT * FROM accounts WHERE email = ?")
    .bind(email.toLowerCase().trim())
    .first<AccountRow>();
  if (!account) throw new HttpError(401, "Email or password is not right");
  const ok = await verifyPassword(password, {
    salt: account.password_salt,
    hash: account.password_hash,
  });
  if (!ok) throw new HttpError(401, "Email or password is not right");
  return account;
}

export function newId(): string {
  return generateId();
}
