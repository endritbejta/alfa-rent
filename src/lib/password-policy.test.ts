import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import {
  generateTemporaryPassword,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_CHARACTERS,
  passwordByteLength,
  passwordProblem,
} from "./password-policy";

describe("the password policy", () => {
  it("is twelve characters at least and 72 bytes at most", () => {
    expect(PASSWORD_MIN_CHARACTERS).toBe(12);
    expect(PASSWORD_MAX_BYTES).toBe(72);
  });

  it("refuses eleven characters and accepts twelve", () => {
    expect(passwordProblem("a".repeat(11))).toBe("tooShort");
    expect(passwordProblem("a".repeat(12))).toBeNull();
    expect(passwordProblem("")).toBe("tooShort");
  });

  it("counts characters as a person does, not UTF-16 code units", () => {
    // Each emoji is two code units, so `length` would call six of them
    // twelve characters long.
    const sixEmoji = "🚗".repeat(6);
    expect(sixEmoji.length).toBe(12);
    expect(passwordProblem(sixEmoji)).toBe("tooShort");
    expect(passwordProblem("🚗".repeat(12))).toBeNull();
  });

  it("accepts exactly 72 bytes of plain letters and refuses 73", () => {
    expect(passwordProblem("a".repeat(72))).toBeNull();
    expect(passwordProblem("a".repeat(73))).toBe("tooLong");
  });

  it("measures bytes, so a multi-byte password is refused past 72 bytes", () => {
    // "ë" is two bytes in UTF-8: 37 of them are 37 characters, comfortably
    // over the minimum, and 74 bytes, over the limit.
    const accented = "ë".repeat(37);
    expect(Array.from(accented)).toHaveLength(37);
    expect(passwordByteLength(accented)).toBe(74);
    expect(passwordProblem(accented)).toBe("tooLong");
    expect(passwordProblem("ë".repeat(36))).toBeNull();

    // Eighteen four-byte emoji are exactly 72 bytes; nineteen are not.
    expect(passwordProblem("🔑".repeat(18))).toBeNull();
    expect(passwordProblem("🔑".repeat(19))).toBe("tooLong");
  });

  it("refuses exactly the passwords bcrypt would silently cut short", () => {
    // bcrypt itself says which inputs it truncates; the policy must agree
    // with it at the boundary, in ASCII and in multi-byte text.
    const samples = [
      "a".repeat(72),
      "a".repeat(73),
      "ë".repeat(36),
      "ë".repeat(37),
      `${"a".repeat(70)}ë`,
      `${"a".repeat(71)}ë`,
      "🔑".repeat(18),
      `${"🔑".repeat(17)}abcde`,
    ];
    for (const password of samples) {
      expect(passwordProblem(password) === "tooLong").toBe(
        bcrypt.truncates(password)
      );
    }
  });

  it("does not trim: spaces count, and are part of the password", () => {
    expect(passwordProblem(" ".repeat(12))).toBeNull();
    expect(passwordProblem("  short  ")).toBe("tooShort");
  });
});

describe("a generated temporary password", () => {
  it("meets the policy and reads in groups of four", () => {
    const password = generateTemporaryPassword();
    expect(passwordProblem(password)).toBeNull();
    expect(password).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
  });

  it("leaves out the characters people misread", () => {
    const sample = Array.from({ length: 200 }, generateTemporaryPassword).join(
      ""
    );
    expect(sample).not.toMatch(/[0O1lI]/);
  });

  it("is different every time", () => {
    const passwords = new Set(
      Array.from({ length: 50 }, generateTemporaryPassword)
    );
    expect(passwords.size).toBe(50);
  });
});
