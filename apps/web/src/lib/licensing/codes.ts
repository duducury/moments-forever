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

/** Public, URL-safe NFC token — separate identifier space from activation codes. */
export function generateNfcToken(length = 22): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)];
  }
  return out;
}

