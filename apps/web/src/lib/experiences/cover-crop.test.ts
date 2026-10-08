import assert from "node:assert/strict";
import test from "node:test";

import { coverImageStyle, clampFocus, isCenterFocus } from "./cover-focus";
import { coverSize, panCrop, visibleWindow, zoomCrop, type CropFrame } from "./cover-crop";

const near = (a: number, b: number, eps = 0.002) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

// A 4:5 frame (the iPhone card) and a wide 3:2 photo.
const WIDE: CropFrame = { frameW: 320, frameH: 400, imageW: 3000, imageH: 2000 };
const TALL: CropFrame = { frameW: 320, frameH: 400, imageW: 2000, imageH: 3000 };

test("cover fit keeps the photo's proportions and covers the frame", () => {
  const { w, h } = coverSize(WIDE);
  near(w / h, 3000 / 2000, 1e-9);
  assert.ok(w >= 320 && h >= 400 - 1e-9);
  assert.equal(h, 400, "a wide photo is as tall as the frame and cropped at the sides");
});

test("the visible window never leaves the photo, whatever the gesture", () => {
  for (const frame of [WIDE, TALL]) {
    let crop = clampFocus({ x: 50, y: 50 });
    for (const [dx, dy, zoom] of [[500, 0, 1], [-900, 300, 2], [40, -700, 4], [-5000, 5000, 3], [0, 0, 1]] as const) {
      crop = zoomCrop(frame, crop, zoom, 160, 200);
      crop = panCrop(frame, crop, dx, dy);
      const win = visibleWindow(frame, crop);
      for (const v of [win.x0, win.y0]) assert.ok(v >= -1e-6, `start ${v}`);
      for (const v of [win.x1, win.y1]) assert.ok(v <= 1 + 1e-6, `end ${v}`);
    }
  }
});

test("dragging moves the photo with the finger (right drag shows more of the left side)", () => {
  const start = clampFocus({ x: 50, y: 50 });
  const before = visibleWindow(WIDE, start);
  const dragged = panCrop(WIDE, start, 40, 0);
  const after = visibleWindow(WIDE, dragged);
  assert.ok(after.x0 < before.x0, "window moved towards the left of the photo");
  near(after.y0, before.y0, 1e-9);
  // 40 px of finger = 40 px of photo: window moved by 40 / displayed width.
  near(before.x0 - after.x0, 40 / coverSize(WIDE).w, 0.002);
});

test("a wide photo cannot be moved up/down at zoom 1 (it already fills the height); zooming unlocks it", () => {
  const start = clampFocus({ x: 50, y: 50 });
  assert.equal(panCrop(WIDE, start, 0, 120).y, 50);
  const zoomed = zoomCrop(WIDE, start, 2, 160, 200);
  assert.notEqual(panCrop(WIDE, zoomed, 0, 60).y, zoomed.y);
});

test("zoom keeps the point under the pinch centre in place", () => {
  const start = clampFocus({ x: 30, y: 60 });
  const anchor = [100, 150] as const;
  const before = visibleWindow(WIDE, start);
  const photoPoint = (win: ReturnType<typeof visibleWindow>) => ({
    x: win.x0 + (anchor[0] / 320) * (win.x1 - win.x0),
    y: win.y0 + (anchor[1] / 400) * (win.y1 - win.y0),
  });
  const zoomed = zoomCrop(WIDE, start, 2.5, anchor[0], anchor[1]);
  const after = visibleWindow(WIDE, zoomed);
  near(photoPoint(after).x, photoPoint(before).x, 0.01);
  near(photoPoint(after).y, photoPoint(before).y, 0.01);
  assert.equal(zoomed.zoom, 2.5);
  // Window got smaller by the zoom factor.
  near((after.x1 - after.x0) * 2.5, before.x1 - before.x0, 0.001);
});

test("zoom is limited to 1…4 and reducing it back returns to the plain cover fit", () => {
  const start = clampFocus({ x: 50, y: 50 });
  assert.equal(zoomCrop(WIDE, start, 99, 160, 200).zoom, 4);
  const back = zoomCrop(WIDE, zoomCrop(WIDE, start, 3, 100, 100), 1, 100, 100);
  assert.equal(back.zoom, undefined, "no zoom stored at 1");
  const win = visibleWindow(WIDE, back);
  near(win.y1 - win.y0, 1, 1e-6);
});

test("a photo that exactly fits the frame does not break (no room to move)", () => {
  const exact: CropFrame = { frameW: 320, frameH: 400, imageW: 800, imageH: 1000 };
  const crop = panCrop(exact, clampFocus({ x: 50, y: 50 }), 80, 80);
  assert.deepEqual(crop, { x: 50, y: 50 });
});

test("the editor and the real cover use the same style function; centred covers add nothing", () => {
  assert.equal(coverImageStyle(null), undefined);
  assert.equal(coverImageStyle({ x: 50, y: 50 }), undefined);
  assert.equal(isCenterFocus({ x: 50, y: 50, zoom: 1 }), true);
  assert.deepEqual(coverImageStyle({ x: 20, y: 65.5 }), { objectPosition: "20% 65.5%" });
  assert.deepEqual(coverImageStyle({ x: 50, y: 50, zoom: 2 }), {
    objectPosition: "50% 50%",
    transform: "scale(2)",
    transformOrigin: "50% 50%",
  });
  assert.equal(isCenterFocus({ x: 50, y: 50, zoom: 2 }), false, "zoomed is stored even when centred");
});

import { readFileSync } from "node:fs";
import path from "node:path";

const read = (file: string) => readFileSync(path.resolve(__dirname, "../../..", file), "utf8");

test("new editor: two sources, ONE preview, Cancelar / Salvar — and none of the old pieces", () => {
  const editor = read("src/app/perfil/cover-editor.tsx");
  for (const text of ["Escolher do álbum", "Escolher do telefone", "Cancelar", "Salvar", "Editar capa"]) {
    assert.ok(editor.includes(text), text);
  }
  assert.doesNotMatch(editor, /Celular|Computador|Centralizar/);
  assert.equal((editor.match(/data-testid="cover-crop-frame"/g) ?? []).length, 1, "a single preview frame");
  assert.match(editor, /coverImageStyle\(crop\)/, "the preview is drawn with the same style function as the cards");
  assert.match(editor, /COVER_ASPECT_WIDTH\} \/ \$\{COVER_ASPECT_HEIGHT/, "the frame has the cover's real shape");
  assert.match(editor, /isNativePhotoPickerAvailable/, "the phone option uses the project's native photo picker");
  assert.match(editor, /uploadFilesToAlbum/, "a phone photo goes through the existing upload");
  const dialog = read("src/app/perfil/edit-place-dialog.tsx");
  assert.match(dialog, /<CoverEditor/);
  assert.doesNotMatch(dialog, /CoverFocusEditor|Celular|Computador/);
});

test("the real cards and the album hero draw covers with coverImageStyle (position AND zoom)", () => {
  assert.match(read("src/components/experience-cover-thumb.tsx"), /coverImageStyle\(focus\)/);
  assert.match(read("src/app/perfil/perfil.module.css"), /\.cover,\n\.coverFallback \{[\s\S]*?overflow: hidden;/, "cards clip the zoomed photo");
  assert.match(read("src/app/trip/[slug]/trip.module.css"), /\.albumHeroHeader \{[\s\S]*?overflow: hidden;/);
  assert.match(read("src/app/perfil/perfil.module.css"), /aspect-ratio: 4 \/ 5;/, "the iPhone card is 4:5");
});

test("saving stores position and zoom; the zoom column is optional until its migration is applied", () => {
  const route = read("src/app/api/albums/[id]/route.ts");
  assert.match(route, /focus_zoom: focus\.zoom \?\? 1/);
  assert.match(route, /if \(saved\.error\)/, "falls back to position-only when the column is missing");
  const migration = read("../../supabase/migrations/20261010100000_album_cover_zoom.sql");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS focus_zoom real NOT NULL DEFAULT 1/);
});
