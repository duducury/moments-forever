export type BlockValidation =
  | { readonly ok: true; readonly blockedId: string }
  | { readonly ok: false; readonly error: string };

/**
 * Pure validation shared by POST /api/blocks — kept separate so it can be
 * unit tested without a request/DB round trip. The DB CHECK constraint
 * user_blocks_not_self is still the real guard against self-block; this
 * only rejects obviously-bad input early with a friendlier message.
 */
export function validateBlockInput(
  blockedIdRaw: string | undefined,
  callerId: string,
): BlockValidation {
  const blockedId = blockedIdRaw?.trim() ?? "";
  if (!blockedId) {
    return { ok: false, error: "blockedId é obrigatório." };
  }
  if (blockedId === callerId) {
    return { ok: false, error: "Você não pode bloquear a própria conta." };
  }
  return { ok: true, blockedId };
}
