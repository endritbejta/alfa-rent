import { describe, expect, it } from "vitest";
import { requireSeedCredentials } from "./seed-safety";

const valid = {
  ALLOW_DESTRUCTIVE_SEED: "WIPE_AND_RESEED",
  SEED_ADMIN_PASSWORD: "admin-password-at-least-16",
  SEED_EMPLOYEE_PASSWORD: "employee-password-at-least-16",
};

describe("destructive seed safety", () => {
  it("requires an exact destructive-operation acknowledgement", () => {
    expect(() =>
      requireSeedCredentials({ ...valid, ALLOW_DESTRUCTIVE_SEED: "" })
    ).toThrow(/Refusing to seed/);
  });

  it("requires strong, distinct staff passwords", () => {
    expect(() =>
      requireSeedCredentials({ ...valid, SEED_ADMIN_PASSWORD: "too-short" })
    ).toThrow(/at least 16/);
    expect(() =>
      requireSeedCredentials({
        ...valid,
        SEED_EMPLOYEE_PASSWORD: valid.SEED_ADMIN_PASSWORD,
      })
    ).toThrow(/must not share/);
  });

  it("returns validated credentials without a fallback", () => {
    expect(requireSeedCredentials(valid)).toEqual({
      adminPassword: valid.SEED_ADMIN_PASSWORD,
      employeePassword: valid.SEED_EMPLOYEE_PASSWORD,
    });
  });
});
