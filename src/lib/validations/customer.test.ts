import { describe, expect, it } from "vitest";
import {
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
