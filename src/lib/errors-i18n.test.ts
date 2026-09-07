import { describe, expect, it } from "vitest";
import { ConflictError, phrase, ValidationError } from "@/lib/errors";
import { dictionaries, translate } from "@/lib/i18n/translations";
import { RESERVATION_STATUS_KEYS } from "@/lib/status-labels";

/**
 * The service layer names its messages rather than writing them, so this
 * asserts the naming — the resolving half needs a request, and lives in a
 * "server-only" module.
 *
 * Before this, every message a service threw was an English literal that
 * client components rendered verbatim, so an Albanian operator read
 * "Cannot change a COMPLETED reservation to CONFIRMED" inside an otherwise
 * fully translated interface.
 */
const read = (
  locale: "en" | "sq",
  error: ValidationError | ConflictError
): string => {
  const text = error.text;
  if (!text) throw new Error("this error was not named");
  const dictionary = dictionaries[locale];
  const values = text.values
    ? Object.fromEntries(
        Object.entries(text.values).map(([k, v]) => [
          k,
          typeof v === "object" ? translate(dictionary, v.key) : v,
        ])
      )
    : undefined;
  return translate(dictionary, text.key, values);
};

describe("a named error", () => {
  it("reads in either language", () => {
    const error = new ConflictError("Vehicle is not available for booking", {
      key: "err.notBookable",
    });
    expect(read("en", error)).toBe("This vehicle is not available for booking");
    expect(read("sq", error)).toBe(
      "Kjo veturë nuk është e disponueshme për rezervim"
    );
  });

  it("interpolates plain values", () => {
    const error = new ValidationError("…", {
      key: "err.returnMustBeLater",
      values: { date: "04 Nov 2027" },
    });
    expect(read("en", error)).toContain("04 Nov 2027");
    expect(read("sq", error)).toContain("04 Nov 2027");
    expect(read("sq", error)).not.toBe(read("en", error));
  });

  /**
   * The reason `phrase` exists: a status shown in a message has to be read
   * in the same language as the message, not left as PENDING.
   *
   * It is also why this message shows the two states as labels either side of
   * an arrow rather than folding them into a sentence — Albanian names them
   * adjectivally, so a sentence would need the forms to agree.
   */
  it("translates a value that is itself a phrase", () => {
    const error = new ValidationError("…", {
      key: "err.badTransition",
      values: {
        from: phrase(RESERVATION_STATUS_KEYS.COMPLETED),
        to: phrase(RESERVATION_STATUS_KEYS.CONFIRMED),
      },
    });
    expect(read("en", error)).toBe(
      "That change is not allowed: Completed → Confirmed."
    );
    expect(read("sq", error)).toBe(
      "Ky kalim nuk lejohet: E përfunduar → E konfirmuar."
    );
    // Never the raw enum in either language.
    expect(read("en", error)).not.toContain("COMPLETED");
    expect(read("sq", error)).not.toContain("CONFIRMED");
  });

  it("keeps the English sentence for the log and the public API", () => {
    const error = new ConflictError("Vehicle is not available for booking", {
      key: "err.notBookable",
    });
    expect(error.message).toBe("Vehicle is not available for booking");
  });
});
