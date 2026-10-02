/** Activation codes look like MF-XXXX-XXXX-XX; formats whatever the user types into that shape. */
export function formatActivationCode(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const withoutPrefix = cleaned.startsWith("MF") ? cleaned.slice(2) : cleaned;
  const groups = [
    withoutPrefix.slice(0, 4),
    withoutPrefix.slice(4, 8),
    withoutPrefix.slice(8, 10),
  ].filter(Boolean);
  return groups.length > 0 ? `MF-${groups.join("-")}` : "";
}

export const ACTIVATION_CODE_PATTERN = /^MF-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{2}$/;
