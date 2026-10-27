import assert from "node:assert/strict";
import test from "node:test";

import { lightboxHeading } from "./lightbox-heading";

test("Porto Rico: country as the title, the route as the subtitle", () => {
  for (const albumLabel of [
    "San Juan → Vieques → Culebra, Porto Rico",
    "Porto Rico, San Juan → Vieques → Culebra",
    "Porto Rico — San Juan → Vieques → Culebra".replace(" — ", ", "),
  ]) {
    assert.deepEqual(
      lightboxHeading({ countryCode: "PR", albumLabel, experienceTitle: "Viagem", placeLabel: null }),
      { title: "Porto Rico", subtitle: "San Juan → Vieques → Culebra" },
      albumLabel,
    );
  }
});

test("a trip in the US keeps Estados Unidos; the territory is never shown as the US", () => {
  assert.deepEqual(
    lightboxHeading({ countryCode: "US", albumLabel: "Miami, Estados Unidos", experienceTitle: null, placeLabel: null }),
    { title: "Estados Unidos", subtitle: "Miami" },
  );
  assert.equal(
    lightboxHeading({ countryCode: "PR", albumLabel: "Estados Unidos, San Juan", experienceTitle: null, placeLabel: null }).title,
    "Porto Rico",
  );
});

test("without a country the place / folder / trip are used, never an empty header", () => {
  assert.deepEqual(
    lightboxHeading({ countryCode: null, albumLabel: "Rio", experienceTitle: "Verão 2026", placeLabel: null }),
    { title: "Rio", subtitle: "Verão 2026" },
  );
  assert.deepEqual(
    lightboxHeading({ countryCode: null, albumLabel: null, experienceTitle: null, placeLabel: null }),
    { title: "Momento", subtitle: null },
  );
});

test("a country-only folder has no subtitle", () => {
  assert.deepEqual(
    lightboxHeading({ countryCode: "JM", albumLabel: "Jamaica", experienceTitle: null, placeLabel: null }),
    { title: "Jamaica", subtitle: null },
  );
});
