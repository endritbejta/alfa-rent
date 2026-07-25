import { describe, expect, it } from "vitest";
import {
  businessDay,
  businessDayStart,
  getReservationTiming,
} from "./reservation-lifecycle";

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

  it("does not start a rental after its whole booking window has passed", () => {
    const timing = getReservationTiming(
      reservation("CONFIRMED"),
      new Date("2026-07-28T08:00:00.000Z")
    );
    expect(timing.canStart).toBe(false);
    expect(timing.startBlockedReason).toBe("Rental window has ended");
    expect(timing.attention).toBe("PICKUP_OVERDUE");
  });
});
