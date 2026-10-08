/**
 * Draws the "Meu resumo de viagens" Instagram-story image (1080×1920) with the
 * Canvas 2D API. Pure drawing: every number, name, date, flag, photo and map
 * point comes from the `JourneySummary` / `JourneyAssets` it is given.
 */

import { bestGlobeView, projectOrthographic } from "./journey-geo";
import { layoutGlobe, type GlobeFrame } from "./journey-layout";
import { MAX_FAVORITE_TRIPS, type JourneySummary } from "./journey-summary";

export const JOURNEY_IMAGE_WIDTH = 1080;
export const JOURNEY_IMAGE_HEIGHT = 1920;

export type DrawableImage = CanvasImageSource & { readonly width: number; readonly height: number };

export interface LandGeoJson {
  readonly features: readonly {
    readonly geometry: { readonly type: string; readonly coordinates: number[][][][] };
  }[];
}

export interface JourneyAssets {
  readonly land: LandGeoJson | null;
  readonly avatar: DrawableImage | null;
  /** Trip cover photos by albumId. */
  readonly covers: ReadonlyMap<string, DrawableImage>;
  /** Pin pictures by photoId. */
  readonly pins: ReadonlyMap<string, DrawableImage>;
  /** Flag pictures by ISO country code (missing ones fall back to the emoji flag). */
  readonly flags: ReadonlyMap<string, DrawableImage>;
}

const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = '-apple-system, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';
const CORAL = "#e8825f";
const OFFWHITE = "#f4efe6";
const MUTED = "#b9b2a7";

const GLOBE: GlobeFrame = { cx: 540, cy: 1130, radius: 540, yMin: 730, yMax: 1190, xInset: 90 };

type Ctx = CanvasRenderingContext2D;

export function emojiFlag(code: string): string {
  const upper = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "";
  return String.fromCodePoint(...[...upper].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Text with manual letter spacing (ctx.letterSpacing is missing on older iOS). */
function spacedText(ctx: Ctx, text: string, x: number, y: number, spacing: number, align: "left" | "center" | "right" = "left"): number {
  const widths = [...text].map((ch) => ctx.measureText(ch).width + spacing);
  const total = widths.reduce((a, b) => a + b, 0) - spacing;
  let cursor = align === "left" ? x : align === "center" ? x - total / 2 : x - total;
  const prev = ctx.textAlign;
  ctx.textAlign = "left";
  [...text].forEach((ch, i) => {
    ctx.fillText(ch, cursor, y);
    cursor += widths[i]!;
  });
  ctx.textAlign = prev;
  return total;
}

function ellipsize(ctx: Ctx, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
}

/** Largest font size (down to `min`) at which `text` fits `maxWidth`; ellipsizes only below that. */
function fitText(ctx: Ctx, text: string, maxWidth: number, font: (size: number) => string, size: number, min: number): string {
  let current = size;
  ctx.font = font(current);
  while (current > min && ctx.measureText(text).width > maxWidth) {
    current -= 1;
    ctx.font = font(current);
  }
  return ellipsize(ctx, text, maxWidth);
}

function wrapLines(ctx: Ctx, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (let i = 0; i < words.length; i += 1) {
    const test = line ? `${line} ${words[i]}` : words[i]!;
    if (ctx.measureText(test).width <= maxWidth || !line) {
      line = test;
    } else {
      lines.push(line);
      line = words[i]!;
      if (lines.length === maxLines - 1) {
        line = words.slice(i).join(" ");
        break;
      }
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines).map((l, i, all) => (i === all.length - 1 ? ellipsize(ctx, l, maxWidth) : l));
}

function drawCover(ctx: Ctx, image: DrawableImage, x: number, y: number, w: number, h: number): void {
  const iw = image.width || 1;
  const ih = image.height || 1;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(image, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

// ---- background ------------------------------------------------------------

function drawBackground(ctx: Ctx): void {
  const W = JOURNEY_IMAGE_WIDTH;
  const H = JOURNEY_IMAGE_HEIGHT;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#04070d");
  sky.addColorStop(0.55, "#070b14");
  sky.addColorStop(1, "#0b0b10");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Warm glow on the right, like the sunset behind the earth.
  const glow = ctx.createRadialGradient(W, 760, 40, W, 760, 760);
  glow.addColorStop(0, "rgba(232,130,95,0.55)");
  glow.addColorStop(0.45, "rgba(170,80,45,0.22)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 300, W, 1000);

  // Stars: decorative, fixed pseudo-random pattern.
  let seed = 90210;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < 190; i += 1) {
    const x = rand() * W;
    const y = rand() * 1300;
    const r = 0.5 + rand() * 1.4;
    ctx.fillStyle = `rgba(255,255,255,${0.15 + rand() * 0.5})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---- header ---------------------------------------------------------------

function drawBrandMark(ctx: Ctx, x: number, baseline: number, scale: number, align: "left" | "center"): number {
  ctx.fillStyle = OFFWHITE;
  ctx.font = `700 ${Math.round(104 * scale)}px ${SERIF}`;
  ctx.textAlign = align;
  ctx.fillText("moments", x, baseline);
  const width = ctx.measureText("moments").width;
  const left = align === "left" ? x : x - width / 2;
  const subY = baseline + 52 * scale;
  ctx.font = `500 ${Math.round(30 * scale)}px ${SANS}`;
  ctx.fillStyle = OFFWHITE;
  const spacing = 22 * scale;
  const subWidth = spacedText(ctx, "FOREVER", left + width / 2, subY, spacing, "center");
  ctx.strokeStyle = CORAL;
  ctx.lineWidth = 2 * scale;
  const gap = 18 * scale;
  ctx.beginPath();
  ctx.moveTo(left, subY - 10 * scale);
  ctx.lineTo(left + width / 2 - subWidth / 2 - gap, subY - 10 * scale);
  ctx.moveTo(left + width / 2 + subWidth / 2 + gap, subY - 10 * scale);
  ctx.lineTo(left + width, subY - 10 * scale);
  ctx.stroke();
  ctx.textAlign = "left";
  return width;
}

function drawHeader(ctx: Ctx, summary: JourneySummary): void {
  drawBrandMark(ctx, 92, 116, 0.92, "left");

  ctx.textAlign = "right";
  ctx.fillStyle = MUTED;
  ctx.font = `500 23px ${SANS}`;
  spacedText(ctx, "MEU RESUMO DE VIAGENS", 988, 84, 5, "right");
  if (summary.period) {
    ctx.fillStyle = CORAL;
    ctx.font = `500 28px ${SANS}`;
    spacedText(ctx, summary.period, 988, 126, 4, "right");
  }
  ctx.textAlign = "left";
}

function drawProfile(ctx: Ctx, summary: JourneySummary, assets: JourneyAssets): void {
  const cx = 170;
  const cy = 306;
  const r = 84;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (assets.avatar) {
    drawCover(ctx, assets.avatar, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = "#1b1612";
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = CORAL;
    ctx.font = `700 84px ${SERIF}`;
    ctx.textAlign = "center";
    ctx.fillText(summary.displayName.trim().slice(0, 1).toUpperCase() || "·", cx, cy + 28);
    ctx.textAlign = "left";
  }
  ctx.restore();
  ctx.lineWidth = 6;
  ctx.strokeStyle = CORAL;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
  ctx.stroke();

  const x = 292;
  ctx.fillStyle = OFFWHITE;
  ctx.font = `700 54px ${SERIF}`;
  ctx.fillText(ellipsize(ctx, summary.displayName, 700), x, 286);

  // Flags of the visited countries.
  let fx = x;
  const flagW = 44;
  const flagH = 30;
  for (const code of summary.countryCodes.slice(0, 12)) {
    drawFlag(ctx, assets, code, fx, 308, flagW, flagH);
    fx += flagW + 12;
  }

  if (summary.bio) {
    ctx.fillStyle = "#d6d0c6";
    ctx.font = `400 27px ${SANS}`;
    const lines = wrapLines(ctx, summary.bio, 690, 2);
    lines.forEach((line, i) => ctx.fillText(line, x, 370 + i * 36));
  }
}

function drawFlag(ctx: Ctx, assets: JourneyAssets, code: string, x: number, y: number, w: number, h: number): void {
  const image = assets.flags.get(code.toUpperCase());
  ctx.save();
  roundRect(ctx, x, y, w, h, 4);
  ctx.clip();
  if (image) {
    drawCover(ctx, image, x, y, w, h);
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = OFFWHITE;
    ctx.font = `${h - 4}px ${SANS}`;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(emojiFlag(code) || code.toUpperCase(), x + 2, y + h - 5);
  }
  ctx.restore();
}

// ---- stats ----------------------------------------------------------------

function drawStatIcon(ctx: Ctx, kind: "trip" | "country" | "city" | "photo", cx: number, cy: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = CORAL;
  ctx.fillStyle = CORAL;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (kind === "trip") {
    // Airplane.
    ctx.beginPath();
    ctx.moveTo(-30, 10);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-14, -22);
    ctx.lineTo(-5, -22);
    ctx.lineTo(10, -4);
    ctx.lineTo(28, -12);
    ctx.quadraticCurveTo(34, -10, 28, -4);
    ctx.lineTo(12, 6);
    ctx.lineTo(20, 24);
    ctx.lineTo(12, 24);
    ctx.lineTo(-2, 10);
    ctx.closePath();
    ctx.fill();
  } else if (kind === "country") {
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.moveTo(-26, 0);
    ctx.lineTo(26, 0);
    ctx.moveTo(0, -26);
    ctx.ellipse(0, 0, 11, 26, 0, -Math.PI / 2, (3 * Math.PI) / 2);
    ctx.moveTo(-22, -12);
    ctx.quadraticCurveTo(0, -6, 22, -12);
    ctx.moveTo(-22, 12);
    ctx.quadraticCurveTo(0, 6, 22, 12);
    ctx.stroke();
  } else if (kind === "city") {
    ctx.beginPath();
    ctx.moveTo(0, 28);
    ctx.bezierCurveTo(-30, -4, -24, -28, 0, -28);
    ctx.bezierCurveTo(24, -28, 30, -4, 0, 28);
    ctx.fill();
    ctx.fillStyle = "#12100e";
    ctx.beginPath();
    ctx.arc(0, -8, 9, 0, Math.PI * 2);
    ctx.fill();
  } else {
    roundRect(ctx, -28, -22, 56, 44, 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-11, -8, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-24, 18);
    ctx.lineTo(-8, 2);
    ctx.lineTo(2, 12);
    ctx.lineTo(12, 0);
    ctx.lineTo(26, 16);
    ctx.stroke();
  }
  ctx.restore();
}

function drawStats(ctx: Ctx, summary: JourneySummary): void {
  const x = 74;
  const y = 428;
  const w = 932;
  const h = 170;
  roundRect(ctx, x, y, w, h, 30);
  ctx.fillStyle = "rgba(14,16,24,0.78)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const items = [
    { kind: "trip" as const, value: summary.stats.trips, label: summary.stats.trips === 1 ? "Viagem" : "Viagens" },
    { kind: "country" as const, value: summary.stats.countries, label: summary.stats.countries === 1 ? "País" : "Países" },
    { kind: "city" as const, value: summary.stats.cities, label: summary.stats.cities === 1 ? "Cidade" : "Cidades" },
    { kind: "photo" as const, value: summary.stats.photos, label: summary.stats.photos === 1 ? "Foto" : "Fotos" },
  ];
  const colW = w / items.length;
  items.forEach((item, i) => {
    const cx = x + colW * i + colW / 2;
    if (i > 0) {
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + colW * i, y + 30);
      ctx.lineTo(x + colW * i, y + h - 30);
      ctx.stroke();
    }
    drawStatIcon(ctx, item.kind, cx, y + 44);
    ctx.fillStyle = OFFWHITE;
    ctx.font = `700 64px ${SERIF}`;
    ctx.textAlign = "center";
    ctx.fillText(item.value.toLocaleString("pt-BR"), cx, y + 120);
    ctx.fillStyle = MUTED;
    ctx.font = `400 25px ${SANS}`;
    ctx.fillText(item.label, cx, y + 154);
    ctx.textAlign = "left";
  });
}

// ---- globe ------------------------------------------------------------------

function drawGlobe(ctx: Ctx, summary: JourneySummary, assets: JourneyAssets): void {
  const { cx, cy, radius } = GLOBE;
  const view = bestGlobeView(summary.clusters, {
    yMin: (GLOBE.yMin - cy) / radius,
    yMax: (GLOBE.yMax - cy) / radius,
    xAbsMax: (JOURNEY_IMAGE_WIDTH / 2 - (GLOBE.xInset ?? 0)) / radius,
  });

  // Atmosphere halo.
  const halo = ctx.createRadialGradient(cx, cy, radius * 0.96, cx, cy, radius * 1.08);
  halo.addColorStop(0, "rgba(120,170,255,0.45)");
  halo.addColorStop(0.5, "rgba(232,130,95,0.18)");
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  const ocean = ctx.createRadialGradient(cx - radius * 0.25, cy - radius * 0.2, radius * 0.1, cx, cy, radius);
  ocean.addColorStop(0, "#14508a");
  ocean.addColorStop(0.6, "#0a2c52");
  ocean.addColorStop(1, "#040f20");
  ctx.fillStyle = ocean;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  if (assets.land) drawLand(ctx, assets.land, view);

  // Light from the right, shadow at the left limb.
  const shade = ctx.createLinearGradient(cx - radius, cy, cx + radius, cy);
  shade.addColorStop(0, "rgba(0,0,0,0.55)");
  shade.addColorStop(0.4, "rgba(0,0,0,0)");
  shade.addColorStop(0.85, "rgba(255,170,110,0.10)");
  shade.addColorStop(1, "rgba(255,170,110,0.32)");
  ctx.fillStyle = shade;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.restore();

  const layout = layoutGlobe(summary.clusters, view, GLOBE);

  // Dotted flight routes.
  ctx.save();
  ctx.setLineDash([3, 14]);
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 4;
  for (const run of layout.routes) {
    ctx.beginPath();
    run.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
  }
  ctx.restore();
  for (const run of layout.routes) {
    if (run.length < 8) continue;
    const mid = Math.floor(run.length / 2);
    const a = run[mid - 1]!;
    const b = run[mid + 1] ?? run[mid]!;
    drawPlane(ctx, run[mid]!.x, run[mid]!.y, Math.atan2(b.y - a.y, b.x - a.x));
  }

  // Dots for the places that did not get a pin.
  for (const dot of layout.dots) {
    const glow = ctx.createRadialGradient(dot.x, dot.y, 0, dot.x, dot.y, 26);
    glow.addColorStop(0, "rgba(255,200,140,0.9)");
    glow.addColorStop(1, "rgba(255,160,90,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff6e6";
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Photo pins, bottom ones last so they overlap upwards.
  [...layout.pins].sort((a, b) => a.y - b.y).forEach((pin) => drawPin(ctx, pin.x, pin.y, assets.pins.get(pin.cluster.photoId) ?? null));
}

function drawLand(ctx: Ctx, land: LandGeoJson, view: { centerLon: number; centerLat: number }): void {
  const { cx, cy, radius } = GLOBE;
  const fill = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
  fill.addColorStop(0, "#2f5b3f");
  fill.addColorStop(0.5, "#3c6a45");
  fill.addColorStop(1, "#6b7a4a");
  ctx.beginPath();
  for (const feature of land.features) {
    const polygons = feature.geometry.type === "MultiPolygon" ? feature.geometry.coordinates : [feature.geometry.coordinates as unknown as number[][][]];
    for (const polygon of polygons as number[][][][]) {
      for (const ring of polygon) {
        const pts: number[] = [];
        let anyVisible = false;
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const [lon, lat] of ring) {
          const p = projectOrthographic(lon!, lat!, view);
          if (p.visible) anyVisible = true;
          const x = cx + p.x * radius;
          const y = cy + p.y * radius;
          pts.push(x, y);
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
        if (!anyVisible || (maxX - minX < 1.2 && maxY - minY < 1.2)) continue;
        ctx.moveTo(pts[0]!, pts[1]!);
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
        ctx.closePath();
      }
    }
  }
  ctx.fillStyle = fill;
  ctx.fill("evenodd");
  ctx.strokeStyle = "rgba(255,226,170,0.22)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function drawPlane(ctx: Ctx, x: number, y: number, angle: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(24, 0);
  ctx.lineTo(4, -5);
  ctx.lineTo(-6, -22);
  ctx.lineTo(-12, -22);
  ctx.lineTo(-7, -4);
  ctx.lineTo(-18, -3);
  ctx.lineTo(-22, -9);
  ctx.lineTo(-26, -9);
  ctx.lineTo(-22, 0);
  ctx.lineTo(-26, 9);
  ctx.lineTo(-22, 9);
  ctx.lineTo(-18, 3);
  ctx.lineTo(-7, 4);
  ctx.lineTo(-12, 22);
  ctx.lineTo(-6, 22);
  ctx.lineTo(4, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPin(ctx: Ctx, x: number, y: number, image: DrawableImage | null): void {
  const r = 42;
  const headY = y - 62;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = "#f4efe6";
  ctx.beginPath();
  ctx.arc(x, headY, r + 5, 0, Math.PI * 2);
  ctx.moveTo(x - 18, headY + r);
  ctx.lineTo(x, y);
  ctx.lineTo(x + 18, headY + r);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, headY, r, 0, Math.PI * 2);
  ctx.clip();
  if (image) drawCover(ctx, image, x - r, headY - r, r * 2, r * 2);
  else {
    ctx.fillStyle = CORAL;
    ctx.fillRect(x - r, headY - r, r * 2, r * 2);
  }
  ctx.restore();
}

// ---- favourites ---------------------------------------------------------------

function drawFavorites(ctx: Ctx, summary: JourneySummary, assets: JourneyAssets): void {
  const W = JOURNEY_IMAGE_WIDTH;
  // Dark base so the lower part of the globe fades under the cards.
  const fade = ctx.createLinearGradient(0, 1150, 0, 1250);
  fade.addColorStop(0, "rgba(7,10,17,0)");
  fade.addColorStop(1, "rgba(7,10,17,0.96)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 1150, W, 100);
  ctx.fillStyle = "rgba(7,10,17,0.96)";
  ctx.fillRect(0, 1250, W, 420);

  const favorites = summary.favorites;
  if (favorites.length === 0) return;

  ctx.fillStyle = CORAL;
  ctx.font = `700 52px ${SERIF}`;
  ctx.fillText("Minhas viagens favoritas", 54, 1292);
  const titleW = ctx.measureText("Minhas viagens favoritas").width;
  ctx.fillStyle = MUTED;
  ctx.font = `500 20px ${SANS}`;
  const counter = `${favorites.length} DE ${MAX_FAVORITE_TRIPS} SELECIONADAS`;
  const counterW = spacedText(ctx, counter, 1026, 1288, 3, "right");
  ctx.strokeStyle = CORAL;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(54 + titleW + 24, 1282);
  ctx.lineTo(1026 - counterW - 24, 1282);
  ctx.stroke();

  const cardW = 192;
  const gap = 12;
  const cardH = 330;
  const top = 1324;
  const total = favorites.length * cardW + (favorites.length - 1) * gap;
  const startX = (W - total) / 2;
  favorites.forEach((trip, i) => {
    const x = startX + i * (cardW + gap);
    roundRect(ctx, x, top, cardW, cardH, 20);
    ctx.fillStyle = "rgba(22,24,32,0.92)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, top + 214);
    ctx.lineTo(x, top + 20);
    ctx.arcTo(x, top, x + 20, top, 20);
    ctx.lineTo(x + cardW - 20, top);
    ctx.arcTo(x + cardW, top, x + cardW, top + 20, 20);
    ctx.lineTo(x + cardW, top + 214);
    ctx.closePath();
    ctx.clip();
    const cover = assets.covers.get(trip.albumId);
    if (cover) drawCover(ctx, cover, x, top, cardW, 214);
    else {
      ctx.fillStyle = "#241c18";
      ctx.fillRect(x, top, cardW, 214);
    }
    ctx.restore();

    const pad = 14;
    ctx.fillStyle = OFFWHITE;
    ctx.fillText(
      fitText(ctx, trip.name, cardW - pad * 2, (n) => `700 ${n}px ${SERIF}`, 27, 18),
      x + pad,
      top + 214 + 36,
    );
    if (trip.countryCode) {
      drawFlag(ctx, assets, trip.countryCode, x + pad, top + 214 + 52, 30, 21);
      ctx.fillStyle = "#d6d0c6";
      ctx.fillText(
        fitText(ctx, trip.countryName ?? trip.countryCode, cardW - pad * 2 - 38, (n) => `400 ${n}px ${SANS}`, 20, 14),
        x + pad + 38,
        top + 214 + 69,
      );
    }
    if (trip.dates) {
      ctx.fillStyle = MUTED;
      ctx.fillText(
        fitText(ctx, trip.dates, cardW - pad * 2, (n) => `400 ${n}px ${SANS}`, 18, 13),
        x + pad,
        top + 214 + 98,
      );
    }
  });
}

// ---- footer ------------------------------------------------------------------

function drawFooter(ctx: Ctx): void {
  const W = JOURNEY_IMAGE_WIDTH;
  const H = JOURNEY_IMAGE_HEIGHT;
  const top = 1670;
  const sunset = ctx.createLinearGradient(0, top, 0, H);
  sunset.addColorStop(0, "#070a11");
  sunset.addColorStop(0.45, "#241823");
  sunset.addColorStop(0.8, "#7a3a2a");
  sunset.addColorStop(1, "#d9803f");
  ctx.fillStyle = sunset;
  ctx.fillRect(0, top, W, H - top);
  const sun = ctx.createRadialGradient(820, 1870, 0, 820, 1870, 330);
  sun.addColorStop(0, "rgba(255,196,120,0.95)");
  sun.addColorStop(0.25, "rgba(255,140,80,0.5)");
  sun.addColorStop(1, "rgba(255,120,60,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, top, W, H - top);
  // Horizon silhouette.
  ctx.fillStyle = "#07070b";
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, 1862);
  ctx.bezierCurveTo(220, 1838, 420, 1884, 640, 1872);
  ctx.bezierCurveTo(820, 1862, 960, 1896, W, 1884);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();

  ctx.textAlign = "center";
  ctx.fillStyle = "#efe8dc";
  ctx.font = `italic 400 46px ${SERIF}`;
  ctx.fillText("“Colecionando", W / 2, 1738);
  ctx.fillText("momentos pelo mundo.”", W / 2, 1792);
  ctx.strokeStyle = CORAL;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 46, 1822);
  ctx.lineTo(W / 2 + 46, 1822);
  ctx.stroke();
  drawBrandMark(ctx, W / 2, 1880, 0.5, "center");
  ctx.textAlign = "left";
}

export function drawJourneyImage(ctx: Ctx, summary: JourneySummary, assets: JourneyAssets): void {
  ctx.save();
  ctx.textBaseline = "alphabetic";
  drawBackground(ctx);
  drawGlobe(ctx, summary, assets);
  drawHeader(ctx, summary);
  drawProfile(ctx, summary, assets);
  drawStats(ctx, summary);
  drawFavorites(ctx, summary, assets);
  drawFooter(ctx);
  ctx.restore();
}
