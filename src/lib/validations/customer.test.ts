import { describe, expect, it } from "vitest";
import {
  ANONYMISED_EMAIL,
  anonymisedEmail,
  anonymisedLastName,
  customerSchema,
  looksLikePhone,
  mergeCustomersSchema,
  normalizePhone,
} from "./customer";

describe("normalizePhone", () => {
  it("reduces every way of writing a Kosovo number to the same digits", () => {
    for (const written of [
      "+383 49 947 292",
      "00383 49 947 292",
      "049 947 292",
      "(049) 947-292",
    ]) {
      expect(normalizePhone(written)).toBe("49947292");
    }
  });
});

describe("looksLikePhone", () => {
  it("accepts a number and refuses a name that happens to hold digits", () => {
    expect(looksLikePhone("049 947")).toBe(true);
    expect(looksLikePhone("+383 49")).toBe(false); // nothing left after 383
    expect(looksLikePhone("Arta 2024")).toBe(false);
  });
});

describe("customerSchema", () => {
  it("lower-cases the email and turns a cleared note into null", () => {
    expect(
      customerSchema.parse({
        firstName: " Arta ",
        lastName: "Krasniqi",
        email: " Arta@Example.COM ",
        phone: "049 947 292",
        notes: "  ",
      })
    ).toEqual({
      firstName: "Arta",
      lastName: "Krasniqi",
      email: "arta@example.com",
      phone: "049 947 292",
      notes: null,
    });
  });
});

describe("mergeCustomersSchema", () => {
  it("refuses to merge a record into itself", () => {
    expect(
      mergeCustomersSchema.safeParse({ keepId: "a", mergeIds: ["a"] }).success
    ).toBe(false);
  });
});

describe("anonymised placeholders", () => {
  it("gives every customer an email of their own, so the unique index holds", () => {
    const ids = [
      "cmabc000000000000000001",
      "cmabc000000000000000002",
      "cmxyz000000000000000001",
    ];
    const emails = ids.map(anonymisedEmail);
    expect(new Set(emails).size).toBe(ids.length);
    expect(anonymisedEmail(ids[0])).toBe(anonymisedEmail(ids[0]));
  });

  it("is never a deliverable address, and is recognisable as a placeholder", () => {
    const email = anonymisedEmail("cmabc000000000000000001");
    expect(email.endsWith(".invalid")).toBe(true);
    expect(ANONYMISED_EMAIL.test(email)).toBe(true);
    expect(ANONYMISED_EMAIL.test("ilir@example.com")).toBe(false);
  });

  it("still passes the email check customer records are held to", () => {
    const parsed = customerSchema.safeParse({
      firstName: "Anonymised",
      lastName: anonymisedLastName("cmabc000000000000000001"),
      email: anonymisedEmail("cmabc000000000000000001"),
      phone: "000000",
    });
    expect(parsed.success).toBe(true);
  });
});
