import { describe, expect, it } from "vitest";
import { brandCardPng } from "../src/worker/lib/og-image";
import {
  hashPassword,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
} from "../src/worker/lib/password";
import { generateSlug, sha256Hex } from "../src/worker/lib/slug";
import { sniffFileType } from "../src/worker/lib/validate";
import { createZipBuilder } from "../src/worker/lib/zip";

function bytes(values: number[]): Uint8Array {
  return new Uint8Array(values);
}

describe("file sniffing", () => {
  it("reads PNG dimensions and rejects a mismatched extension", () => {
    const header = new Uint8Array(24);
    header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    new DataView(header.buffer).setUint32(16, 1200);
    new DataView(header.buffer).setUint32(20, 630);
    expect(sniffFileType(header, "cover.png")).toEqual({
      contentType: "image/png",
      width: 1200,
      height: 630,
    });
    expect(() => sniffFileType(header, "cover.jpg")).toThrow("TYPE_EXTENSION_MISMATCH");
  });

  it("recognises jpeg, gif, webp and pdf, and refuses svg", () => {
    expect(sniffFileType(bytes([0xff, 0xd8, 0xff, 0xe0]), "a.jpeg").contentType).toBe("image/jpeg");
    expect(sniffFileType(bytes(Array.from("GIF89a", (c) => c.charCodeAt(0))), "a.gif").contentType).toBe("image/gif");
    const webp = new Uint8Array(16);
    webp.set(Array.from("RIFF", (c) => c.charCodeAt(0)));
    webp.set(Array.from("WEBP", (c) => c.charCodeAt(0)), 8);
    expect(sniffFileType(webp, "a.webp").contentType).toBe("image/webp");
    expect(sniffFileType(bytes(Array.from("%PDF-1.7", (c) => c.charCodeAt(0))), "a.pdf").contentType).toBe("application/pdf");
    expect(() => sniffFileType(bytes(Array.from("<svg", (c) => c.charCodeAt(0))), "a.svg")).toThrow("UNSUPPORTED_TYPE");
  });
});

describe("passwords and tokens", () => {
  it("hashes and verifies, and rejects the wrong password", async () => {
    const record = await hashPassword("correct horse");
    expect(record.hash).not.toContain("correct horse");
    expect(await verifyPassword("correct horse", record)).toBe(true);
    expect(await verifyPassword("wrong", record)).toBe(false);
  });

  it("binds an access token to its slug and expiry", async () => {
    const token = await signAccessToken("slug-one", "secret", Date.now() + 60_000);
    expect(await verifyAccessToken(token, "slug-one", "secret")).toBe(true);
    expect(await verifyAccessToken(token, "slug-two", "secret")).toBe(false);
    expect(await verifyAccessToken(token, "slug-one", "other-secret")).toBe(false);
    const expired = await signAccessToken("slug-one", "secret", Date.now() - 1);
    expect(await verifyAccessToken(expired, "slug-one", "secret")).toBe(false);
  });
});

describe("tokens and brand asset", () => {
  it("makes url-safe tokens and stable digests", async () => {
    const slug = generateSlug();
    expect(slug).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(slug.length).toBeGreaterThanOrEqual(24);
    expect(await sha256Hex("kelpo")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("encodes a real PNG card", () => {
    const png = brandCardPng();
    expect(Array.from(png.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(new DataView(png.buffer, png.byteOffset + 16).getUint32(0)).toBe(1200);
  });
});

describe("zip streaming", () => {
  it("stores entries uncompressed with the original bytes", async () => {
    const builder = createZipBuilder();
    const payload = new TextEncoder().encode("original bytes");
    await builder.add("01-frame.jpg", new ReadableStream({
      start(controller) {
        controller.enqueue(payload);
        controller.close();
      },
    }));
    builder.end();

    const chunks: Uint8Array[] = [];
    const reader = builder.stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const zipped = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      zipped.set(chunk, offset);
      offset += chunk.length;
    }
    expect(Array.from(zipped.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(new TextDecoder().decode(zipped)).toContain("01-frame.jpg");
    expect(new TextDecoder().decode(zipped)).toContain("original bytes");
  });
});
