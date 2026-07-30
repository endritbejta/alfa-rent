import { describe, expect, it } from "vitest";
import {
  canApplyPaymentStatus,
  isTerminalPaymentStatus,
} from "@/lib/payments/status";

describe("payment status transitions", () => {
  it("accepts normal checkout and settlement transitions", () => {
    expect(canApplyPaymentStatus("PENDING", "PROCESSING")).toBe(true);
    expect(canApplyPaymentStatus("PROCESSING", "SUCCEEDED")).toBe(true);
  });

  it("allows a verified success after an earlier failure notification", () => {
    expect(canApplyPaymentStatus("FAILED", "SUCCEEDED")).toBe(true);
  });

  it("never downgrades a successful payment", () => {
    expect(canApplyPaymentStatus("SUCCEEDED", "FAILED")).toBe(false);
    expect(isTerminalPaymentStatus("SUCCEEDED")).toBe(true);
  });
});
