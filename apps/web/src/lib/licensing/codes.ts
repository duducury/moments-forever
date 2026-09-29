import { randomBytes, randomInt } from "node:crypto";

/**
 * Excludes visually ambiguous characters (0/O, 1/I/L) — these codes ship
 * printed on physical NFC packaging and get typed by hand.
 */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function randomSegment(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return out;
}

/** MF-XXXX-XXXX-XX, cryptographically random, never sequential/guessable. */
export function generateActivationCode(): string {
  return `MF-${randomSegment(4)}-${randomSegment(4)}-${randomSegment(2)}`;
}

const TOKEN_ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * Public, URL-safe NFC token — separate identifier space from activation
 * codes. Short on purpose: it ends up on a physical NFC tag's NDEF record
 * (small tags like NTAG213 only hold ~137 usable bytes) and in the URL
 * visitors see. 10 chars from a 62-char alphabet is ~10^17 combinations —
 * far more than this app will ever issue — and this route isn't a security
 * boundary anyway (access to the underlying trip is still gated by RLS).
 */
export function generateNfcToken(length = 10): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)];
  }
  return out;
}

