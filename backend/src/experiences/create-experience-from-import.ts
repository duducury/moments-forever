import {
  buildCreateExperiencePayload,
  type CreateExperienceFromImportPayload,
} from "@moments-forever/shared";
import type {
  CreateExperienceFromImportResult,
  ExperienceImportDraft,
} from "@moments-forever/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export {
  assertLocalSupabaseUrl,
  buildCreateExperiencePayload,
  isUuid,
  suggestExperienceSlug,
  type CreateExperienceFromImportPayload,
} from "@moments-forever/shared";

/**
 * Persists a Stage 1 import draft against local Supabase via one RPC transaction.
 * Server/backend only — do not import from Client Components.
 */
export async function createExperienceFromImport(
  draft: ExperienceImportDraft,
  supabase: SupabaseClient,
  generateId?: () => string,
): Promise<CreateExperienceFromImportResult> {
  const payload: CreateExperienceFromImportPayload = generateId
    ? buildCreateExperiencePayload(draft, generateId)
    : buildCreateExperiencePayload(draft);

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
