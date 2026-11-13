import { describe, expect, it } from "vitest";
import {
  actionableRequestWhere,
  expiredRequestWhere,
  getReservationTiming,
  isExpiredRequest,
} from "./reservation-lifecycle";
import {
  businessDay,
  businessDayStart,
  recordedRentalInstant,
} from "@/lib/business-time";

const reservation = (
  status: "CONFIRMED" | "ACTIVE",
  pickup = "2026-07-24T10:00:00.000Z",
  returnDate = "2026-07-27T10:00:00.000Z"
) => ({
  status,
  pickupDate: new Date(pickup),
  returnDate: new Date(returnDate),
});

describe("reservation lifecycle timing", () => {
  it("uses the local business date even when the server clock is still on the previous UTC day", () => {
    expect(businessDay(new Date("2026-07-23T22:30:00.000Z"))).toBe(
      "2026-07-24"
    );
  });

  it("calculates branch midnight across daylight-saving time", () => {
    expect(
      businessDayStart(new Date("2026-07-24T12:00:00.000Z")).toISOString()
    ).toBe("2026-07-23T22:00:00.000Z");
    expect(
      businessDayStart(new Date("2026-01-24T12:00:00.000Z")).toISOString()
    ).toBe("2026-01-23T23:00:00.000Z");
  });

  it("does not allow a confirmed rental to start before pickup day", () => {
    const timing = getReservationTiming(
      reservation("CONFIRMED"),
      new Date("2026-07-23T12:00:00.000Z")
    );
    expect(timing.canStart).toBe(false);
    expect(timing.startBlockedReason).toBe("Available on the pickup date");
  });

  it("allows the handover on pickup day and calls it out", () => {
    const timing = getReservationTiming(
      reservation("CONFIRMED"),
      new Date("2026-07-24T08:00:00.000Z")
    );
    expect(timing.canStart).toBe(true);
    expect(timing.attention).toBe("PICKUP_TODAY");
  });

  it("marks an active rental overdue after its return day", () => {
    const timing = getReservationTiming(
      reservation("ACTIVE"),
      new Date("2026-07-28T08:00:00.000Z")
    );
    expect(timing.attention).toBe("RETURN_OVERDUE");
  });

  it("does not flag a start on the pickup day as late", () => {
    const timing = getReservationTiming(
      reservation("CONFIRMED"),
      new Date("2026-07-24T20:00:00.000Z")
    );
    expect(timing.canStart).toBe(true);
    expect(timing.lateStart).toBe(false);
  });

  it("allows a start after the pickup day, flagged as late", () => {
    const timing = getReservationTiming(
      reservation("CONFIRMED"),
      new Date("2026-07-25T08:00:00.000Z")
    );
    expect(timing.canStart).toBe(true);
    expect(timing.lateStart).toBe(true);
    expect(timing.startBlockedReason).toBeNull();
    // Still running: it can't be recorded as a finished rental yet.
    expect(timing.canRecordPast).toBe(false);
  });

  it("offers recording as completed only once the return day has passed", () => {
    const onReturnDay = getReservationTiming(
      reservation("CONFIRMED"),
      new Date("2026-07-27T20:00:00.000Z")
    );
    expect(onReturnDay.canRecordPast).toBe(false);
    const after = getReservationTiming(
      reservation("CONFIRMED"),
      new Date("2026-07-28T08:00:00.000Z")
    );
    expect(after.canRecordPast).toBe(true);
    const active = getReservationTiming(
      reservation("ACTIVE"),
      new Date("2026-07-28T08:00:00.000Z")
    );
    expect(active.canRecordPast).toBe(false);
  });

  it("still allows a late start once the whole booking window has passed", () => {
    const timing = getReservationTiming(
      reservation("CONFIRMED"),
      new Date("2026-07-28T08:00:00.000Z")
    );
    expect(timing.canStart).toBe(true);
    expect(timing.lateStart).toBe(true);
    expect(timing.startBlockedReason).toBeNull();
    expect(timing.attention).toBe("PICKUP_OVERDUE");
    expect(timing).toMatchObject({
      pickupDay: "2026-07-24",
      returnDay: "2026-07-27",
      today: "2026-07-28",
    });
  });

  it("never flags an active rental as a late start", () => {
    const timing = getReservationTiming(
      reservation("ACTIVE"),
      new Date("2026-07-28T08:00:00.000Z")
    );
    expect(timing.canStart).toBe(false);
    expect(timing.lateStart).toBe(false);
  });
});

describe("recordedRentalInstant", () => {
  const scheduled = new Date("2026-07-24T10:00:00.000Z");
  const now = new Date("2026-07-28T13:45:00.000Z");

  it("is now when the day is today", () => {
    expect(recordedRentalInstant("2026-07-28", scheduled, now)).toBe(now);
  });

  it("puts an earlier day at the scheduled branch time (summer, UTC+2)", () => {
    expect(
      recordedRentalInstant("2026-07-24", scheduled, now).toISOString()
    ).toBe("2026-07-24T08:00:00.000Z");
  });

  it("follows winter time too (UTC+1)", () => {
    expect(
      recordedRentalInstant(
        "2026-01-24",
        new Date("2026-01-20T10:00:00.000Z"),
        new Date("2026-02-01T12:00:00.000Z")
      ).toISOString()
    ).toBe("2026-01-24T09:00:00.000Z");
  });
});

describe("an expired request", () => {
  const request = (pickupDay: string) => ({
    status: "PENDING" as const,
    pickupDate: new Date(`${pickupDay}T10:00:00.000Z`),
  });
  const at = (iso: string) => new Date(iso);

  /** Both halves must agree: the badge counts what the queue labels. */
  const expectExpired = (pickupDay: string, now: Date, expired: boolean) => {
    const r = request(pickupDay);
    expect(isExpiredRequest(r, now)).toBe(expired);
    const bound = expiredRequestWhere(now).pickupDate.lt;
    expect(r.pickupDate < bound).toBe(expired);
    expect(r.pickupDate >= actionableRequestWhere(now).pickupDate.gte).toBe(
      !expired
    );
  };

  it("is still actionable on its pickup day, up to local midnight", () => {
    // Summer time (CEST, UTC+2): 23:59:59 on 24 July in Belgrade.
    expectExpired("2026-07-24", at("2026-07-24T21:59:59.000Z"), false);
  });

  it("expires at local midnight, while the server clock is still on the previous UTC day", () => {
    // 00:00 on 25 July in Belgrade is 22:00 on 24 July in UTC.
    expectExpired("2026-07-24", at("2026-07-24T22:00:00.000Z"), true);
  });

  it("follows local midnight in winter time too", () => {
    // CET, UTC+1.
    expectExpired("2026-01-24", at("2026-01-24T22:59:59.000Z"), false);
    expectExpired("2026-01-24", at("2026-01-24T23:00:00.000Z"), true);
  });

  it("moves its cut-off by an hour across the October clock change", () => {
    // Clocks go back at 03:00 CEST on 25 October 2026, so midnight that night
    // is 23:00 UTC rather than the 22:00 UTC of the night before.
    expectExpired("2026-10-24", at("2026-10-24T21:59:59.000Z"), false);
    expectExpired("2026-10-24", at("2026-10-24T22:00:00.000Z"), true);
    expectExpired("2026-10-25", at("2026-10-25T22:59:59.000Z"), false);
    expectExpired("2026-10-25", at("2026-10-25T23:00:00.000Z"), true);
  });

  it("moves its cut-off by an hour across the March clock change", () => {
    // Clocks go forward at 02:00 CET on 29 March 2026.
    expectExpired("2026-03-28", at("2026-03-28T22:59:59.000Z"), false);
    expectExpired("2026-03-28", at("2026-03-28T23:00:00.000Z"), true);
    expectExpired("2026-03-29", at("2026-03-29T21:59:59.000Z"), false);
    expectExpired("2026-03-29", at("2026-03-29T22:00:00.000Z"), true);
  });

  it("applies only to requests", () => {
    const now = at("2026-07-30T08:00:00.000Z");
    for (const status of ["CONFIRMED", "ACTIVE", "CANCELLED"] as const) {
      expect(isExpiredRequest({ ...request("2026-07-24"), status }, now)).toBe(
        false
      );
    }
  });

  it("is called out on the reservation's timing", () => {
    const pending = {
      ...request("2026-07-24"),
      returnDate: new Date("2026-07-27T10:00:00.000Z"),
    };
    expect(
      getReservationTiming(pending, at("2026-07-24T08:00:00.000Z")).attention
    ).toBeNull();
    expect(
      getReservationTiming(pending, at("2026-07-25T08:00:00.000Z")).attention
    ).toBe("REQUEST_EXPIRED");
  });
});
