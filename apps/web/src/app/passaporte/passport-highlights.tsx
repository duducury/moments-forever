import { Suspense } from "react";

import { PolaroidStack } from "@/app/perfil/polaroid-stack";
import perfilStyles from "@/app/perfil/perfil.module.css";
import { loadOwnerCarouselPhotos } from "@/lib/experiences/load-owner-carousel-photos";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import styles from "./passaporte.module.css";

function Heading() {
  return (
    <h2 className={perfilStyles.highlightsTitle} id="passport-highlights-title">
      Cada foto conta uma{" "}
      <span className={perfilStyles.highlightsTitleAccent}>história</span>
    </h2>
  );
}

async function HighlightsBody({ ownerId }: { readonly ownerId: string }) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const photos = await loadOwnerCarouselPhotos(supabase, ownerId);
  if (photos.length === 0) return null;
  return (
    <section
      aria-labelledby="passport-highlights-title"
      className={styles.section}
      data-reveal
    >
      <Heading />
      <PolaroidStack photos={photos} />
    </section>
  );
}

/**
 * "Cada foto conta uma história": the stacked-polaroid photos of the passport owner, shown before "Conquistas".
 * Streams in behind its own Suspense (the photo query must not delay the passport), reserving its height meanwhile.
 */
export function PassportHighlights({ ownerId }: { readonly ownerId: string }) {
  return (
    <Suspense
      fallback={
        <section
          aria-labelledby="passport-highlights-title"
          className={styles.section}
        >
          <Heading />
          <div aria-hidden="true" className={perfilStyles.polaroidSkeleton} />
        </section>
      }
    >
      <HighlightsBody ownerId={ownerId} />
    </Suspense>
  );
}
