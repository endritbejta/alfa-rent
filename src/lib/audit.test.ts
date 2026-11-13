import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import {
  AUDIT_ACTIONS,
  auditEntity,
  auditFields,
  diffFields,
  normaliseAuditValue,
  recordAudit,
} from "@/lib/audit";
import { dictionaries } from "@/lib/i18n/translations";
import { updateReservationStatusSchema } from "@/lib/validations/reservation";
import { CANCEL_REASON_MIN } from "@/lib/cancel-reason";

describe("normaliseAuditValue", () => {
  it("keeps money exact and dates as instants", () => {
    expect(normaliseAuditValue(new Prisma.Decimal("60"))).toBe("60.00");
    expect(normaliseAuditValue(new Prisma.Decimal("0.1").add("0.2"))).toBe(
      "0.30"
    );
    expect(normaliseAuditValue(new Date("2026-11-13T09:30:00.000Z"))).toBe(
      "2026-11-13T09:30:00.000Z"
    );
  });

  it("passes plain values through and turns missing into null", () => {
    expect(normaliseAuditValue("a")).toBe("a");
    expect(normaliseAuditValue(3)).toBe(3);
    expect(normaliseAuditValue(false)).toBe(false);
    expect(normaliseAuditValue(undefined)).toBeNull();
    expect(normaliseAuditValue(null)).toBeNull();
  });
});

describe("diffFields", () => {
  const row = {
    firstName: "Arta",
    phone: "+383 44 111 222",
    notes: "Prefers automatic",
    pricePerDay: new Prisma.Decimal("60.00"),
    lastServiceDate: new Date("2026-01-01T00:00:00.000Z"),
    password: "$2b$12$never-compared-because-not-submitted",
  };

  it("keeps only what changed, old and new side by side", () => {
    expect(
      diffFields(row, {
        firstName: "Arta",
        phone: "+383 44 999 000",
        notes: null,
      })
    ).toEqual({
      before: { phone: "+383 44 111 222", notes: "Prefers automatic" },
      after: { phone: "+383 44 999 000", notes: null },
    });
  });

  it("ignores fields the change did not touch, even secrets on the row", () => {
    const diff = diffFields(row, { firstName: "Ana" });
    expect(diff).toEqual({
      before: { firstName: "Arta" },
      after: { firstName: "Ana" },
    });
    expect(JSON.stringify(diff)).not.toContain("$2b$");
  });

  it("treats undefined as 'left unchanged', the way Prisma does", () => {
    expect(diffFields(row, { phone: undefined })).toBeNull();
  });

  it("compares a submitted number with a stored Decimal as money", () => {
    expect(diffFields(row, { pricePerDay: 60 })).toBeNull();
    expect(diffFields(row, { pricePerDay: 65.5 })).toEqual({
      before: { pricePerDay: "60.00" },
      after: { pricePerDay: "65.50" },
    });
  });

  it("compares dates by instant", () => {
    expect(
      diffFields(row, {
        lastServiceDate: new Date("2026-01-01T00:00:00.000Z"),
      })
    ).toBeNull();
  });

  it("returns null when nothing changed", () => {
    expect(diffFields(row, { firstName: "Arta" })).toBeNull();
    expect(diffFields(row, {})).toBeNull();
  });
});

describe("auditFields", () => {
  it("normalises every value, arrays included, and drops undefined", () => {
    expect(
      auditFields({
        total: new Prisma.Decimal(12),
        ids: ["a", "b"],
        skipped: undefined,
        none: null,
      })
    ).toEqual({ total: "12.00", ids: ["a", "b"], none: null });
  });
});

describe("the action list", () => {
  it("derives the entity from the action", () => {
    expect(auditEntity("reservation.cancel")).toBe("reservation");
    expect(auditEntity("staff.changeOwnPassword")).toBe("staff");
  });

  it("is said in both languages", () => {
    for (const action of AUDIT_ACTIONS) {
      for (const dictionary of Object.values(dictionaries)) {
        expect(dictionary[`audit.${action}`]).toBeTruthy();
      }
    }
  });
});

describe("recordAudit", () => {
  const fakeTx = () => {
    const create = vi.fn(async () => ({}));
    return {
      tx: { auditEvent: { create } } as unknown as Prisma.TransactionClient,
      create,
    };
  };

  it("writes one row through the transaction it is given", async () => {
    const { tx, create } = fakeTx();
    await recordAudit(tx, {
      actorId: "user-1",
      action: "reservation.cancel",
      entityId: "res-1",
      before: { status: "PENDING" },
      after: { status: "CANCELLED" },
      reason: "  Customer called  ",
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: {
        actorId: "user-1",
        system: false,
        action: "reservation.cancel",
        entity: "reservation",
        entityId: "res-1",
        before: { status: "PENDING" },
        after: { status: "CANCELLED" },
        reason: "Customer called",
      },
    });
  });

  it("marks an event with no actor as a system one, and stores empty as NULL", async () => {
    const { tx, create } = fakeTx();
    await recordAudit(tx, {
      actorId: null,
      action: "reservation.confirm",
      entityId: "res-1",
      after: {},
      reason: "   ",
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: null,
        system: true,
        before: Prisma.DbNull,
        after: Prisma.DbNull,
        reason: null,
      }),
    });
  });

  it("refuses to record a password, a hash's column or a token", async () => {
    for (const key of [
      "password",
      "temporaryPassword",
      "sessionVersion",
      "token",
    ]) {
      const { tx, create } = fakeTx();
      await expect(
        recordAudit(tx, {
          actorId: "user-1",
          action: "staff.resetPassword",
          entityId: "user-2",
          after: { [key]: "x" },
        })
      ).rejects.toThrow(key);
      expect(create).not.toHaveBeenCalled();
    }
  });
});

describe("the cancellation reason", () => {
  const parse = (status: string, reason?: string | null) =>
    updateReservationStatusSchema.safeParse({ status, reason });

  it(`is required to cancel, at least ${CANCEL_REASON_MIN} characters once trimmed`, () => {
    expect(parse("CANCELLED").success).toBe(false);
    expect(parse("CANCELLED", "").success).toBe(false);
    expect(parse("CANCELLED", " ".repeat(20)).success).toBe(false);
    expect(parse("CANCELLED", "too short").success).toBe(false);
    expect(parse("CANCELLED", "  Customer called  ").data?.reason).toBe(
      "Customer called"
    );
  });

  it("is not asked for when confirming", () => {
    expect(parse("CONFIRMED").success).toBe(true);
    expect(parse("CONFIRMED").data?.reason).toBeNull();
  });

  it("is bounded", () => {
    expect(parse("CANCELLED", "x".repeat(501)).success).toBe(false);
  });
});
