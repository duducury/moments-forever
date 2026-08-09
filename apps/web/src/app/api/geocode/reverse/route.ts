import { NextResponse } from "next/server";

import {
  canApplySuggestedPlaceName,
  collectGeocodeLookups,
  geocodeCacheKey,
} from "@moments-forever/shared";

import { resolveLabelsForCoordinates } from "@/lib/location/resolve-place-labels";

const MAX_LOOKUPS = 24;

interface IncomingLookup {
  readonly id?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly name?: string;
  readonly confirmedByUser?: boolean;
}

interface PostBody {
  readonly lookups?: readonly IncomingLookup[];
}

/**
 * Reverse-geocode place cluster centers for the import review UI.
 * Only lat/lon (+ optional current label) are accepted — never photo bytes.
 */
export async function POST(request: Request) {
  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const raw = body.lookups ?? [];
  if (raw.length === 0) {
    return NextResponse.json({ labels: {} });
  }
  if (raw.length > MAX_LOOKUPS) {
    return NextResponse.json(
      { error: `Envie no máximo ${MAX_LOOKUPS} coordenadas por vez.` },
      { status: 400 },
    );
  }

  const targets = raw.flatMap((item) => {
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const latitude = item.latitude;
    const longitude = item.longitude;
    if (
      !id ||
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return [];
    }
    return [
      {
        id,
        latitude,
        longitude,
        name:
          typeof item.name === "string" && item.name.trim()
            ? item.name.trim()
            : "Lugar 1",
        confirmedByUser: Boolean(item.confirmedByUser),
      },
    ];
  });

  if (targets.length === 0) {
    return NextResponse.json({ labels: {} });
  }

  try {
    const lookups = collectGeocodeLookups(targets, canApplySuggestedPlaceName);
    const { labels: byKey } = await resolveLabelsForCoordinates(
      lookups.map((lookup) => ({
        key: lookup.key,
        latitude: lookup.latitude,
        longitude: lookup.longitude,
      })),
    );

    const labels: Record<string, string> = {};
    for (const lookup of lookups) {
      const label = byKey.get(lookup.key);
      if (!label) continue;
      for (const targetId of lookup.targetIds) {
        labels[targetId] = label;
      }
    }

    return NextResponse.json({
      labels,
      meta: {
        lookupKeys: lookups.map((lookup) =>
          geocodeCacheKey(lookup.latitude, lookup.longitude),
        ),
      },
    });
  } catch {
    // Never block import review on geocoder failures.
    return NextResponse.json({ labels: {} });
  }
}
