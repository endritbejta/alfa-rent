import type { PaymentStatus } from "@prisma/client";

const TERMINAL_STATUSES = new Set<PaymentStatus>([
  "SUCCEEDED",
  "CANCELLED",
  "EXPIRED",
]);

const ALLOWED_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  PENDING: ["PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED"],
  PROCESSING: ["SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED"],
  FAILED: ["SUCCEEDED"],
  SUCCEEDED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export function canApplyPaymentStatus(
  current: PaymentStatus,
  next: PaymentStatus
) {
  return current === next || ALLOWED_TRANSITIONS[current].includes(next);
}

export function isTerminalPaymentStatus(status: PaymentStatus) {
  return TERMINAL_STATUSES.has(status);
}
