import { describe, expect, it } from "vitest";
import {
  createPaymentAccessToken,
  verifyPaymentAccessToken,
} from "@/lib/payments/access-token";

describe("payment access tokens", () => {
  it("verifies the raw token without storing it", () => {
    const { token, hash } = createPaymentAccessToken();
    expect(hash).not.toContain(token);
    expect(verifyPaymentAccessToken(token, hash)).toBe(true);
    expect(verifyPaymentAccessToken(`${token}x`, hash)).toBe(false);
  });

  it("safely rejects a malformed stored hash", () => {
    expect(verifyPaymentAccessToken("token", "not-hex")).toBe(false);
  });
});
