/** Short display label for the signed-in user (nav / discreet UI). */
export function displayNameFromUser(user: {
  readonly email?: string | null;
  readonly user_metadata?: Record<string, unknown>;
}): string {
  const metaName = user.user_metadata?.full_name;
  if (typeof metaName === "string" && metaName.trim()) {
    return metaName.trim();
  }
  const metaDisplay = user.user_metadata?.name;
  if (typeof metaDisplay === "string" && metaDisplay.trim()) {
    return metaDisplay.trim();
  }
  const email = user.email?.trim();
  if (email) {
    const local = email.split("@")[0]?.trim();
    if (local) return local;
  }
  return "Perfil";
}
