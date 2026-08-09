import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canApplySuggestedPlaceName,
  cleanLocationLabel,
  isGenericLocationLabel,
  resolveLocationDisplayName,
} from "./location-name.ts";

test("cleanLocationLabel strips rounded coordinate suffix", () => {
  assert.equal(
    cleanLocationLabel("Local 1 · -8.72, 115.54"),
    "Local 1",
  );
  assert.equal(cleanLocationLabel("Nusa Penida"), "Nusa Penida");
});

test("isGenericLocationLabel covers Local/Lugar/Álbum fallbacks", () => {
  assert.equal(isGenericLocationLabel("Local 2"), true);
  assert.equal(isGenericLocationLabel("Lugar 3"), true);
  assert.equal(isGenericLocationLabel("Álbum 3"), true);
  assert.equal(isGenericLocationLabel("Nusa Penida"), false);
  assert.equal(isGenericLocationLabel("Data 2026-07-28 · local desconhecido"), true);
});

test("resolveLocationDisplayName prefers user-confirmed place", () => {
  assert.equal(
    resolveLocationDisplayName({
      albumName: "Local 2",
      placeName: "Crystal Bay",
      placeConfirmedByUser: true,
    }),
    "Crystal Bay",
  );
});

test("resolveLocationDisplayName uses suggested place when unconfirmed", () => {
  assert.equal(
    resolveLocationDisplayName({
      albumName: "Local 2",
      placeName: "Nusa Penida",
      placeConfirmedByUser: false,
    }),
    "Nusa Penida",
  );
});

test("resolveLocationDisplayName uses renamed album over generic place", () => {
  assert.equal(
    resolveLocationDisplayName({
      albumName: "Crystal Bay",
      placeName: "Local 2",
      placeConfirmedByUser: false,
    }),
    "Crystal Bay",
  );
});

test("resolveLocationDisplayName falls back to stored generic or Lugar N", () => {
  assert.equal(
    resolveLocationDisplayName({
      albumName: "Local 2",
      placeName: "Local 2",
      placeConfirmedByUser: false,
      fallbackIndex: 2,
    }),
    "Local 2",
  );
  assert.equal(
    resolveLocationDisplayName({
      albumName: "",
      placeName: null,
      fallbackIndex: 4,
    }),
    "Lugar 4",
  );
});

test("canApplySuggestedPlaceName blocks confirmed real names", () => {
  assert.equal(
    canApplySuggestedPlaceName({
      name: "Nusa Penida",
      confirmedByUser: true,
    }),
    false,
  );
  assert.equal(
    canApplySuggestedPlaceName({
      name: "Local 1",
      confirmedByUser: true,
    }),
    true,
  );
  assert.equal(
    canApplySuggestedPlaceName({
      name: "Local 1",
      confirmedByUser: false,
    }),
    true,
  );
});
