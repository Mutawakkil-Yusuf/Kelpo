/** Upload validation: allowlist by extension AND sniffed magic bytes. */

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_FILES_PER_LINK = 15;

const EXTENSIONS_BY_TYPE: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/gif": ["gif"],
  "application/pdf": ["pdf"],
};

export interface SniffResult {
  contentType: string;
  width: number | null;
  height: number | null;
}

function startsWith(head: Uint8Array, bytes: number[] | string): boolean {
  const expected =
    typeof bytes === "string" ? Array.from(bytes, (c) => c.charCodeAt(0)) : bytes;
  return expected.every((byte, i) => head[i] === byte);
}

function pngSize(head: Uint8Array) {
  if (head.length < 24) return { width: null, height: null };
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function gifSize(head: Uint8Array) {
  if (head.length < 10) return { width: null, height: null };
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
}

export function sniffFileType(head: Uint8Array, name: string): SniffResult {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";

  let result: SniffResult | null = null;
  if (startsWith(head, [0xff, 0xd8, 0xff])) {
    result = { contentType: "image/jpeg", width: null, height: null };
  } else if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    result = { contentType: "image/png", ...pngSize(head) };
  } else if (startsWith(head, "GIF87a") || startsWith(head, "GIF89a")) {
    result = { contentType: "image/gif", ...gifSize(head) };
  } else if (startsWith(head, "RIFF") && startsWith(head.subarray(8), "WEBP")) {
    result = { contentType: "image/webp", width: null, height: null };
  } else if (startsWith(head, "%PDF-")) {
    result = { contentType: "application/pdf", width: null, height: null };
  }

  if (!result) throw new Error("UNSUPPORTED_TYPE");
  if (!EXTENSIONS_BY_TYPE[result.contentType]?.includes(extension)) {
    throw new Error("TYPE_EXTENSION_MISMATCH");
  }
  return result;
}

export function assertFileAllowed(name: string, size: number): void {
  if (size > MAX_FILE_BYTES) throw new Error("FILE_TOO_LARGE");
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (!Object.values(EXTENSIONS_BY_TYPE).flat().includes(extension)) {
    throw new Error("UNSUPPORTED_TYPE");
  }
}

export function safeFileName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, "-")
    .slice(0, 80);
}
