/** Password hashing and signed link-access cookies. Web Crypto only. */

const encoder = new TextEncoder();
const ITERATIONS = 210_000;

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export interface PasswordRecord {
  salt: string;
  hash: string;
}

async function derive(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const safeSalt = new Uint8Array(salt.length);
  safeSalt.set(salt);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: safeSalt, iterations: ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<PasswordRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: toBase64(salt), hash: toBase64(await derive(password, salt)) };
}

export async function verifyPassword(
  password: string,
  record: PasswordRecord,
): Promise<boolean> {
  const expected = fromBase64(record.hash);
  const actual = await derive(password, fromBase64(record.salt));
  return constantTimeEqual(actual, expected);
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toBase64(await crypto.subtle.sign("HMAC", key, encoder.encode(value)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Token body is just an expiry timestamp; the slug is bound into the signature. */
export async function signAccessToken(
  slug: string,
  secret: string,
  expiresAt: number,
): Promise<string> {
  const payload = String(expiresAt);
  return `${payload}.${await sign(`${slug}.${payload}`, secret)}`;
}

export async function verifyAccessToken(
  token: string | undefined,
  slug: string,
  secret: string,
): Promise<boolean> {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = await sign(`${slug}.${payload}`, secret);
  if (!constantTimeEqual(encoder.encode(signature), encoder.encode(expected))) {
    return false;
  }
  return Number(payload) > Date.now();
}
