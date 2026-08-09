import {
  buildCreateExperiencePayload,
  type CreateExperienceFromImportPayload,
} from "@moments-forever/shared";
import type {
  CreateExperienceFromImportResult,
  ExperienceImportDraft,
} from "@moments-forever/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only persistence. Import from Route Handlers / Server Components,
 * never from Client Components.
 */
export async function createExperienceFromImport(
  draft: ExperienceImportDraft,
  supabase: SupabaseClient,
): Promise<CreateExperienceFromImportResult> {
  const payload: CreateExperienceFromImportPayload =
    buildCreateExperiencePayload(draft);

  const { data, error } = await supabase.rpc("create_experience_from_import", {
    payload,
  });

  if (error) {
    throw new Error(`createExperienceFromImport failed: ${error.message}`);
  }

  if (
    !data ||
    typeof data !== "object" ||
    typeof (data as { id?: unknown }).id !== "string" ||
    typeof (data as { slug?: unknown }).slug !== "string"
  ) {
    throw new Error("createExperienceFromImport returned an invalid payload.");
  }

  return {
    id: (data as { id: string }).id,
    slug: (data as { slug: string }).slug,
  };
}
