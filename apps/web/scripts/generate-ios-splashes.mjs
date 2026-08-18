#!/usr/bin/env node
/**
 * iPhone startup images: dark canvas + centered app icon.
 * iOS shows a white launch screen unless apple-touch-startup-image matches.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

const DARK = { r: 18, g: 17, b: 16 }; // #121110
const SIZES = [
  [1320, 2868],
  [1260, 2736],
  [1206, 2622],
  [1290, 2796],
  [1179, 2556],
  [1284, 2778],
  [1170, 2532],
  [1242, 2688],
  [1080, 2340],
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

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodeRgbPng(buffer) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, 8).equals(sig)) {
    throw new Error("Not a PNG");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (bitDepth !== 8 || colorType !== 2) {
    throw new Error(`Unsupported PNG ${bitDepth}/${colorType}`);
  }
  const bpp = 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const pixels = Buffer.alloc(width * height * bpp);
  let src = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[src];
    src += 1;
    const row = Buffer.alloc(stride);
    raw.copy(row, 0, src, src + stride);
    src += stride;
    if (filter === 1) {
      for (let i = bpp; i < stride; i += 1) row[i] = (row[i] + row[i - bpp]) & 255;
    } else if (filter === 2) {
      for (let i = 0; i < stride; i += 1) row[i] = (row[i] + prev[i]) & 255;
    } else if (filter === 3) {
      for (let i = 0; i < stride; i += 1) {
        const left = i >= bpp ? row[i - bpp] : 0;
        row[i] = (row[i] + Math.floor((left + prev[i]) / 2)) & 255;
      }
    } else if (filter === 4) {
      for (let i = 0; i < stride; i += 1) {
        const left = i >= bpp ? row[i - bpp] : 0;
        const upLeft = i >= bpp ? prev[i - bpp] : 0;
        row[i] = (row[i] + paeth(left, prev[i], upLeft)) & 255;
      }
    } else if (filter !== 0) {
      throw new Error(`Unsupported PNG filter ${filter}`);
    }
    row.copy(pixels, y * stride);
    prev = row;
  }
  return { width, height, pixels };
}

function blitIcon(canvas, canvasW, canvasH, icon, iconSize) {
  const destX = Math.floor((canvasW - iconSize) / 2);
  const destY = Math.floor((canvasH - iconSize) / 2);
  for (let y = 0; y < iconSize; y += 1) {
    const srcY = Math.min(
      icon.height - 1,
      Math.floor((y * icon.height) / iconSize),
    );
    for (let x = 0; x < iconSize; x += 1) {
      const srcX = Math.min(
        icon.width - 1,
        Math.floor((x * icon.width) / iconSize),
      );
      const si = (srcY * icon.width + srcX) * 3;
      const dx = destX + x;
      const dy = destY + y;
      if (dx < 0 || dy < 0 || dx >= canvasW || dy >= canvasH) continue;
      const di = (dy * canvasW + dx) * 3;
      canvas[di] = icon.pixels[si];
      canvas[di + 1] = icon.pixels[si + 1];
      canvas[di + 2] = icon.pixels[si + 2];
    }
  }
}

function rgbPng(width, height, pixels) {
  const rowLength = 1 + width * 3;
  const raw = Buffer.alloc(rowLength * height);
  for (let y = 0; y < height; y += 1) {
    const dest = y * rowLength;
    raw[dest] = 0;
    pixels.copy(raw, dest + 1, y * width * 3, (y + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const root = dirname(fileURLToPath(import.meta.url));
const icon = decodeRgbPng(
  readFileSync(join(root, "../public/brand/apple-touch-icon.png")),
);
const outDir = join(root, "../public/brand/splash");
mkdirSync(outDir, { recursive: true });

for (const [width, height] of SIZES) {
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = DARK.r;
    pixels[i + 1] = DARK.g;
    pixels[i + 2] = DARK.b;
  }
  const iconSize = Math.round(Math.min(width, height) * 0.22);
  blitIcon(pixels, width, height, icon, iconSize);
  const png = rgbPng(width, height, pixels);
  writeFileSync(join(outDir, `${width}x${height}.png`), png);
  const hash = createHash("sha1").update(png).digest("hex").slice(0, 8);
  console.log(`${width}x${height} ${png.length}B ${hash}`);
}
