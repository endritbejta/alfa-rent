import { describe, expect, it } from "vitest";
import {
  changeOwnPasswordSchema,
  changeStaffRoleSchema,
  createStaffSchema,
  resetStaffPasswordSchema,
  staffTargetSchema,
} from "./staff";

const strong = "correct horse battery";

describe("createStaffSchema", () => {
  const valid = {
    name: "  Arta Krasniqi ",
    email: "  Arta.Krasniqi@Example.TEST ",
    role: "EMPLOYEE",
    temporaryPassword: strong,
  };

  it("trims the name and trims and lower-cases the email", () => {
    expect(createStaffSchema.parse(valid)).toEqual({
      name: "Arta Krasniqi",
      email: "arta.krasniqi@example.test",
      role: "EMPLOYEE",
      temporaryPassword: strong,
    });
  });

  it("never trims the password", () => {
    const padded = ` ${strong} `;
    expect(
      createStaffSchema.parse({ ...valid, temporaryPassword: padded })
        .temporaryPassword
    ).toBe(padded);
  });

  it("refuses a blank name and an address that is not one", () => {
    expect(createStaffSchema.safeParse({ ...valid, name: "   " }).success).toBe(
      false
    );
    expect(
      createStaffSchema.safeParse({ ...valid, email: "arta@" }).success
    ).toBe(false);
  });

  it("accepts only the two roles the schema knows", () => {
    expect(
      createStaffSchema.safeParse({ ...valid, role: "ADMIN" }).success
    ).toBe(true);
    expect(
      createStaffSchema.safeParse({ ...valid, role: "OWNER" }).success
    ).toBe(false);
    expect(
      createStaffSchema.safeParse({ ...valid, role: "admin" }).success
    ).toBe(false);
  });

  it("holds the temporary password to the policy", () => {
    expect(
      createStaffSchema.safeParse({ ...valid, temporaryPassword: "short" })
        .success
    ).toBe(false);
    expect(
      createStaffSchema.safeParse({
        ...valid,
        temporaryPassword: "ë".repeat(37),
      }).success
    ).toBe(false);
  });

  it("refuses a request with a field missing or of the wrong type", () => {
    expect(
      createStaffSchema.safeParse({ ...valid, name: undefined }).success
    ).toBe(false);
    expect(
      createStaffSchema.safeParse({ ...valid, temporaryPassword: 12345 })
        .success
    ).toBe(false);
  });
});

describe("the per-account schemas", () => {
  it("need a user id, and nothing absurd in it", () => {
    expect(staffTargetSchema.safeParse({ userId: "ckabc123" }).success).toBe(
      true
    );
    expect(staffTargetSchema.safeParse({ userId: "" }).success).toBe(false);
    expect(
      staffTargetSchema.safeParse({ userId: "x".repeat(65) }).success
    ).toBe(false);
    expect(staffTargetSchema.safeParse({}).success).toBe(false);
  });

  it("changes a role only to a real role", () => {
    expect(
      changeStaffRoleSchema.safeParse({ userId: "u1", role: "EMPLOYEE" })
        .success
    ).toBe(true);
    expect(
      changeStaffRoleSchema.safeParse({ userId: "u1", role: "SUPERUSER" })
        .success
    ).toBe(false);
  });

  it("resets only to a password the policy accepts", () => {
    expect(
      resetStaffPasswordSchema.safeParse({
        userId: "u1",
        temporaryPassword: strong,
      }).success
    ).toBe(true);
    expect(
      resetStaffPasswordSchema.safeParse({
        userId: "u1",
        temporaryPassword: "a".repeat(73),
      }).success
    ).toBe(false);
  });
});

describe("changeOwnPasswordSchema", () => {
  const valid = {
    currentPassword: "whatever it is today",
    newPassword: strong,
    confirmPassword: strong,
  };

  it("accepts a new password that meets the policy and is repeated", () => {
    expect(changeOwnPasswordSchema.parse(valid)).toEqual(valid);
  });

  it("refuses a confirmation that does not match, on the confirmation", () => {
    const result = changeOwnPasswordSchema.safeParse({
      ...valid,
      confirmPassword: `${strong}!`,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["confirmPassword"]);
  });

  it("holds the new password to the policy but not the current one", () => {
    expect(
      changeOwnPasswordSchema.safeParse({
        ...valid,
        newPassword: "short",
        confirmPassword: "short",
      }).success
    ).toBe(false);
    // An account may predate the policy; its current password is whatever
    // it is.
    expect(
      changeOwnPasswordSchema.safeParse({ ...valid, currentPassword: "old" })
        .success
    ).toBe(true);
    expect(
      changeOwnPasswordSchema.safeParse({ ...valid, currentPassword: "" })
        .success
    ).toBe(false);
  });
});
