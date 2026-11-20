/** Small branded OG card, encoded as PNG in-process. No image service needed. */

import { zlibSync } from "fflate";

const WIDTH = 1200;
const HEIGHT = 630;
const PAPER = [244, 241, 234];
const INK = [20, 20, 20];
const SIGNAL = [255, 77, 0];

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function build(): Uint8Array {
  const stride = WIDTH * 4 + 1;
  const raw = new Uint8Array(stride * HEIGHT);
  const set = (x: number, y: number, rgb: number[]) => {
    const offset = y * stride + 1 + x * 4;
    raw[offset] = rgb[0];
    raw[offset + 1] = rgb[1];
    raw[offset + 2] = rgb[2];
    raw[offset + 3] = 255;
  };

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) set(x, y, PAPER);
  }
  // Seal: a notched orange square with a 3x3 grid of paper dots.
  for (let y = 96; y < 276; y++) {
    for (let x = 96; x < 276; x++) {
      if (x > 232 && y < 140) continue;
      set(x, y, SIGNAL);
    }
  }
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cx = 132 + col * 48;
      const cy = 132 + row * 48;
      for (let y = cy - 9; y <= cy + 9; y++) {
        for (let x = cx - 9; x <= cx + 9; x++) {
          if ((x - cx) ** 2 + (y - cy) ** 2 <= 81) set(x, y, PAPER);
        }
      }
    }
  }
  // Hairline rule and a short ink bar: the delivery sheet motif.
  for (let x = 96; x < 1104; x++) {
    for (let y = 470; y < 473; y++) set(x, y, INK);
  }
  for (let x = 96; x < 420; x++) {
    for (let y = 500; y < 514; y++) set(x, y, INK);
  }

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, WIDTH);
  ihdrView.setUint32(4, HEIGHT);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return concat([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlibSync(raw, { level: 6 })),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

let cached: Uint8Array | null = null;

export function brandCardPng(): Uint8Array {
  cached ??= build();
  return cached;
}
