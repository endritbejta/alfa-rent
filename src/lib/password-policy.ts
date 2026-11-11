/**
 * What a staff password has to be.
 *
 * One function, read in three places: the forms check it as the person types,
 * the Zod schemas refuse a request that breaks it, and the staff service
 * enforces it again before anything is hashed. Nothing here imports from the
 * server, so the client bundle can carry it without pulling Prisma or zod in
 * after it.
 */
import type { TranslationKey } from "@/lib/i18n/translations";

/**
 * Twelve characters, counted the way a person counts them: an emoji or an
 * accented letter is one character, not the two or four code units a
 * JavaScript `length` would report.
 */
export const PASSWORD_MIN_CHARACTERS = 12;

/**
 * bcrypt reads at most the first 72 bytes of a password and ignores the rest
 * without saying so. A longer password is therefore not the password it looks
 * like: two that differ only after byte 72 are the same password, and the
 * tail the person thinks is protecting them does nothing. Refusing it is the
 * only honest answer.
 *
 * Bytes, not characters. In UTF-8 "ë" and "ç" take two bytes and an emoji
 * four, so 72 bytes is fewer than 72 characters for most Albanian passphrases.
 */
export const PASSWORD_MAX_BYTES = 72;

export type PasswordProblem = "tooShort" | "tooLong";

/**
 * How each problem is said, as a translation key and its values: the same
 * words whether the form catches it as someone types or the service refuses
 * it. A type-only import, so the dictionary itself stays out of this module.
 */
export const PASSWORD_PROBLEM_TEXT = {
  tooShort: {
    key: "err.passwordTooShort",
    values: { min: PASSWORD_MIN_CHARACTERS },
  },
  tooLong: { key: "err.passwordTooLong", values: { max: PASSWORD_MAX_BYTES } },
} as const satisfies Record<
  PasswordProblem,
  { key: TranslationKey; values: Record<string, number> }
>;

const utf8 = new TextEncoder();

export function passwordByteLength(password: string): number {
  return utf8.encode(password).length;
}

/** The first rule the password breaks, or null when it meets the policy. */
export function passwordProblem(password: string): PasswordProblem | null {
  if (Array.from(password).length < PASSWORD_MIN_CHARACTERS) return "tooShort";
  if (passwordByteLength(password) > PASSWORD_MAX_BYTES) return "tooLong";
  return null;
}

/*
 * Letters and digits that cannot be mistaken for one another when read off a
 * screen or said across a counter: no 0/O, 1/l/I. 56 symbols, so twelve of
 * them carry about 70 bits, far more than a password that is replaced at
 * first sign-in needs.
 */
const TEMPORARY_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/**
 * A temporary password for an admin to hand over: `xxxx-xxxx-xxxx`, grouped
 * so it can be read out and typed without losing your place.
 *
 * crypto.getRandomValues, never Math.random. Bytes past the largest multiple
 * of the alphabet's size are thrown away rather than folded in with `%`,
 * which would make the first few letters likelier than the rest.
 */
export function generateTemporaryPassword(): string {
  const size = TEMPORARY_ALPHABET.length;
  const ceiling = 256 - (256 % size);
  const picked: string[] = [];
  while (picked.length < 12) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte < ceiling && picked.length < 12) {
        picked.push(TEMPORARY_ALPHABET[byte % size]!);
      }
    }
  }
  return [0, 4, 8].map((at) => picked.slice(at, at + 4).join("")).join("-");
}
