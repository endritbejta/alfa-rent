import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { API_ERROR_CODES } from "@/lib/api-error-codes";
import { assertWithinRequestCaps } from "@/lib/booking-caps";
import {
  ConflictError,
  ForbiddenError,
  IdempotencyKeyReusedError,
  normalizeError,
  NotFoundError,
  ServiceUnavailableError,
  TooManyRequestsError,
  UnsupportedMediaTypeError,
} from "@/lib/errors";
import {
  dictionaries,
  translate,
  type TranslationKey,
} from "@/lib/i18n/translations";
import {
  CODE_MESSAGES,
  DATE_RULE_MESSAGES,
  FIELD_MESSAGES,
  publicErrorText,
  REASON_MESSAGES,
} from "@/lib/public-error";
import { createBookingSchema } from "@/lib/validations/reservation";

// An unknown error is reported before it is hidden; not here.
vi.mock("@/lib/observability");

/** The error body the storefront receives for a thrown value. */
const bodyFor = (error: unknown) => normalizeError(error).body.error;

const thrown = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
};

const day = (offset: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10) + "T10:00:00.000Z";
};

const validBooking = {
  vehicleId: "veh_1",
  pickupDate: day(10),
  returnDate: day(12),
  customer: {
    firstName: "Arta",
    lastName: "Krasniqi",
    email: "arta@example.test",
    phone: "+383 44 123 456",
  },
};

const zodFailure = (patch: Record<string, unknown>) =>
  bodyFor(
    thrown(() => createBookingSchema.parse({ ...validBooking, ...patch }))
  );

const withCustomer = (patch: Record<string, unknown>) =>
  zodFailure({ customer: { ...validBooking.customer, ...patch } });

/** Every key the table can hand back, said in both languages. */
const everyMappedKey: TranslationKey[] = [
  ...Object.values(CODE_MESSAGES),
  ...Object.values(REASON_MESSAGES),
  ...Object.values(DATE_RULE_MESSAGES).map((rule) => rule.key),
  ...Object.values(FIELD_MESSAGES).map((rule) => rule.key),
  "publicError.nameTooLong",
  "publicError.vehicleInvalid",
  "publicError.checkDetails",
];

describe("public error translation", () => {
  it("has a message for every API error code", () => {
    for (const code of API_ERROR_CODES) {
      expect(CODE_MESSAGES, code).toHaveProperty(code);
    }
  });

  it("knows every code lib/errors.ts can put in a response", () => {
    // The list is only as good as its coverage: a code written into
    // errors.ts but not listed would reach the client unmapped.
    const source = readFileSync(
      path.join(process.cwd(), "src/lib/errors.ts"),
      "utf8"
    );
    const written = new Set(
      [...source.matchAll(/"([A-Z][A-Z_]{2,})"/g)].map((m) => m[1])
    );
    expect(written.size).toBeGreaterThan(5);
    for (const code of written) {
      expect(API_ERROR_CODES, code).toContain(code);
    }
  });

  it("says every mapped message in both languages, with nothing left to fill in", () => {
    const values = { count: 3, days: 365 };
    for (const key of everyMappedKey) {
      for (const locale of ["sq", "en"] as const) {
        const text = translate(dictionaries[locale], key, values);
        expect(text, `${locale} ${key}`).toMatch(/\S/);
        expect(text, `${locale} ${key}`).not.toMatch(/[{}]/);
      }
    }
  });

  it("writes the storefront's own sentences in Albanian, not copied English", () => {
    const own = Object.keys(dictionaries.en).filter((key) =>
      key.startsWith("publicError.")
    ) as TranslationKey[];
    expect(own.length).toBeGreaterThan(10);
    for (const key of own) {
      expect(dictionaries.sq[key], key).not.toBe(dictionaries.en[key]);
    }
  });

  it("names reasons after the service's own message keys", () => {
    // reason is an ErrorText key without "err."; a renamed key would
    // silently fall back to the code's sentence.
    for (const reason of Object.keys(REASON_MESSAGES)) {
      expect(dictionaries.en, reason).toHaveProperty(`err.${reason}`);
    }
  });

  describe("maps each refusal the booking and availability routes give", () => {
    const cases: [string, unknown, TranslationKey, Record<string, number>?][] =
      [
        [
          "an overlap",
          new ConflictError("Vehicle is already booked", {
            key: "err.alreadyBooked",
          }),
          "publicError.alreadyBooked",
        ],
        [
          "the exclusion constraint itself",
          new Error('violates exclusion constraint "reservations_no_overlap"'),
          "publicError.alreadyBooked",
        ],
        [
          "a car taken off the road",
          new ConflictError("Vehicle is not available for booking", {
            key: "err.notBookable",
          }),
          "publicError.notBookable",
        ],
        [
          "the per-person PENDING cap",
          thrown(() =>
            assertWithinRequestCaps({ openForContact: 3, busiestVehicleDay: 0 })
          ),
          "err.pendingLimitContact",
          { count: 3 },
        ],
        [
          "the per-car PENDING cap",
          thrown(() =>
            assertWithinRequestCaps({ openForContact: 0, busiestVehicleDay: 5 })
          ),
          "err.pendingLimitVehicle",
        ],
        [
          "the rate limit",
          new TooManyRequestsError(
            "You have sent several booking requests recently."
          ),
          "publicError.rateLimited",
        ],
        [
          "a cross-site request",
          new ForbiddenError("Cross-site requests are not accepted"),
          "publicError.blocked",
        ],
        [
          "a body not sent as JSON",
          new UnsupportedMediaTypeError(),
          "publicError.blocked",
        ],
        [
          "a car that no longer exists",
          new NotFoundError("Vehicle"),
          "publicError.vehicleGone",
        ],
        [
          "a reused idempotency key",
          new IdempotencyKeyReusedError(),
          "err.idempotencyKeyReused",
        ],
        [
          "a service that is switched off",
          new ServiceUnavailableError(),
          "publicError.unavailable",
        ],
        [
          "a unique violation",
          bodyFor(new ConflictError("dup", { key: "err.duplicateValue" })),
          "publicError.conflict",
        ],
        [
          "an unexpected failure",
          new Error("connection refused at 10.0.0.3"),
          "publicError.generic",
        ],
      ];

    it.each(cases)("%s", (_, error, key, values) => {
      const body = error instanceof Error ? bodyFor(error) : error;
      expect(publicErrorText(body)).toEqual({ key, values });
    });
  });

  describe("turns validation errors into field messages, never Zod's text", () => {
    it.each([
      [
        "a return before the pickup",
        { returnDate: day(5) },
        "booking.rangeError",
        "to",
      ],
      [
        "a pickup in the past",
        { pickupDate: day(-3), returnDate: day(2) },
        "publicError.pickupInPast",
        "from",
      ],
      [
        "a pickup too far ahead",
        { pickupDate: day(800), returnDate: day(801) },
        "publicError.pickupTooFar",
        "from",
      ],
      [
        "a rental that is too long",
        { returnDate: day(400) },
        "publicError.rentalTooLong",
        "to",
      ],
      [
        "an unreadable pickup date",
        { pickupDate: "not a date" },
        "publicError.dateInvalid",
        "from",
      ],
    ] as const)("%s", (_, patch, key, field) => {
      const text = publicErrorText(zodFailure(patch));
      expect(text.key).toBe(key);
      expect(text.field).toBe(field);
    });

    it("carries the limit into the sentence", () => {
      const text = publicErrorText(zodFailure({ returnDate: day(400) }));
      expect(translate(dictionaries.sq, text.key, text.values)).toContain(
        "365 ditë"
      );
    });

    it.each([
      ["an invalid email", { email: "arta" }, "booking.validEmail", "email"],
      ["a short phone number", { phone: "12" }, "booking.validPhone", "phone"],
      [
        "an empty first name",
        { firstName: "" },
        "booking.required",
        "firstName",
      ],
      [
        "a long last name",
        { lastName: "x".repeat(60) },
        "publicError.nameTooLong",
        "lastName",
      ],
    ] as const)("%s", (_, patch, key, field) => {
      expect(publicErrorText(withCustomer(patch))).toEqual({ key, field });
    });

    it("says a missing car in a summary, not as the raw path", () => {
      const body = zodFailure({ vehicleId: "" });
      expect(body.message).toMatch(/^vehicleId: /);
      expect(publicErrorText(body)).toEqual({
        key: "publicError.vehicleInvalid",
      });
    });

    it("says anything else about the form in a summary", () => {
      expect(publicErrorText(zodFailure({ customer: undefined }))).toEqual({
        key: "publicError.invalid",
      });
    });
  });

  describe("never shows text it does not know", () => {
    it.each([
      ["an unknown code", { code: "TEAPOT", message: "I am a teapot" }],
      ["no code", { message: "Something in English" }],
      ["a body that is not an object", "Bad Gateway"],
      ["nothing", undefined],
      ["an inherited name as a reason", { code: "TEAPOT", reason: "toString" }],
    ])("%s", (_, error) => {
      expect(publicErrorText(error)).toEqual({ key: "publicError.generic" });
    });

    it("falls back to the code's sentence for a reason it does not know", () => {
      expect(
        publicErrorText({ code: "CONFLICT", reason: "somethingNew" })
      ).toEqual({ key: "publicError.conflict" });
    });

    it("ignores a parameter that is not a number", () => {
      expect(
        publicErrorText({
          code: "CONFLICT",
          reason: "pendingLimitContact",
          params: { count: "<b>3</b>" },
        })
      ).toEqual({ key: "err.pendingLimitContact", values: undefined });
    });
  });
});

describe("the API contract", () => {
  it("still answers with an English message and the code", () => {
    const body = bodyFor(
      thrown(() =>
        assertWithinRequestCaps({ openForContact: 3, busiestVehicleDay: 0 })
      )
    );
    expect(body).toEqual({
      code: "CONFLICT",
      message: expect.stringMatching(/^You already have 3 booking requests/),
      reason: "pendingLimitContact",
      params: { count: 3 },
    });
  });

  it("names the field and rule of a validation error, keeping Zod's message", () => {
    expect(zodFailure({ returnDate: day(400) })).toEqual({
      code: "VALIDATION_ERROR",
      message: "returnDate: Rental duration cannot exceed 365 days",
      field: "returnDate",
      reason: "rentalTooLong",
      params: { days: 365 },
    });
  });

  it("adds nothing to an unexpected error", () => {
    expect(bodyFor(new Error("boom"))).toEqual({
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    });
  });
});
