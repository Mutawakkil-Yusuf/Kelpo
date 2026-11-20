/** Random tokens and stable hashes. All randomness comes from Web Crypto. */

function randomToken(bytes: number): string {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const byte of raw) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** URL-safe link capability token: 18 random bytes -> 24 base64url chars. */
export function generateSlug(): string {
  return randomToken(18);
}

/** Short id for a file row and R2 object name. */
export function generateId(): string {
  return randomToken(12);
}

/** 32-byte secret kept only in the sender's cookie. */
export function generateOwnerToken(): string {
  return randomToken(32);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** IPs are never stored raw — only a keyed digest. */
export function hashIp(ip: string, secret: string): Promise<string> {
  return sha256Hex(`${secret}:${ip}`);
}
