#!/usr/bin/env node
/**
 * Solid-color iPhone startup images (exact device pixels).
 * iOS shows a white launch screen unless apple-touch-startup-image matches.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const DARK = { r: 18, g: 17, b: 16 }; // #121110
const SIZES = [
  [1320, 2868],
  [1206, 2622],
  [1290, 2796],
  [1179, 2556],
  [1284, 2778],
  [1170, 2532],
  [1242, 2688],
  [828, 1792],
  [1125, 2436],
  [1242, 2208],
  [750, 1334],
  [640, 1136],
];

function crc32(buffer) {
  let crc = ~0;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([length, typeBuf, data, crc]);
}

function solidPng(width, height, { r, g, b }) {
  const row = Buffer.alloc(1 + width * 3);
  row[0] = 0;
  for (let x = 0; x < width; x += 1) {
    const i = 1 + x * 3;
    row[i] = r;
    row[i + 1] = g;
    row[i + 2] = b;
  }
  const raw = Buffer.alloc(row.length * height);
  for (let y = 0; y < height; y += 1) {
    row.copy(raw, y * row.length);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../public/brand/splash",
);
mkdirSync(outDir, { recursive: true });

for (const [width, height] of SIZES) {
  const png = solidPng(width, height, DARK);
  const file = join(outDir, `${width}x${height}.png`);
  writeFileSync(file, png);
  const hash = createHash("sha1").update(png).digest("hex").slice(0, 8);
  console.log(`${width}x${height} ${png.length}B ${hash}`);
}
