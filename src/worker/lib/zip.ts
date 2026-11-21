/** Streaming ZIP with STORE (no recompression). Originals stay byte for byte. */

import { Zip, ZipPassThrough } from "fflate";

export interface ZipBuilder {
  stream: ReadableStream<Uint8Array>;
  add(name: string, body: ReadableStream<Uint8Array>): Promise<void>;
  end(): void;
}

export function createZipBuilder(): ZipBuilder {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  const zip = new Zip((error, data, final) => {
    if (error) {
      controller.error(error);
      return;
    }
    if (data.length) controller.enqueue(data);
    if (final) controller.close();
  });

  return {
    stream,
    async add(name, body) {
      const entry = new ZipPassThrough(name);
      zip.add(entry);
      const reader = body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        entry.push(value);
      }
      entry.push(new Uint8Array(0), true);
    },
    end() {
      zip.end();
    },
  };
}

export function zipHeaders(fileName: string): HeadersInit {
  return {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${fileName}.zip"`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
}
