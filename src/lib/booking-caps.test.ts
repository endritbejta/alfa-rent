import { describe, expect, it } from "vitest";
import {
  assertWithinRequestCaps,
  busiestDayCount,
  MAX_OPEN_REQUESTS_PER_CONTACT,
  MAX_OPEN_REQUESTS_PER_VEHICLE_DAY,
} from "@/lib/booking-caps";
import { ConflictError } from "@/lib/errors";

const day = (d: string) => new Date(`${d}T10:00:00.000Z`);
const range = (from: string, to: string) => ({
  pickupDate: day(from),
  returnDate: day(to),
});

describe("busiestDayCount", () => {
  it("is zero with no other requests", () => {
    expect(busiestDayCount(range("2027-08-01", "2027-08-05"), [])).toBe(0);
  });

  it("counts the busiest single day, not every request that touches the range", () => {
    // Three requests, but never more than two on the same day.
    const others = [
      range("2027-08-01", "2027-08-01"),
      range("2027-08-01", "2027-08-02"),
      range("2027-08-04", "2027-08-05"),
    ];
    expect(busiestDayCount(range("2027-08-01", "2027-08-05"), others)).toBe(2);
  });

  it("counts both ends inclusive", () => {
    const others = [
      range("2027-07-28", "2027-08-01"),
      range("2027-08-05", "2027-08-09"),
    ];
    expect(busiestDayCount(range("2027-08-01", "2027-08-01"), others)).toBe(1);
    expect(busiestDayCount(range("2027-08-05", "2027-08-05"), others)).toBe(1);
    expect(busiestDayCount(range("2027-08-02", "2027-08-04"), others)).toBe(0);
  });

  it("handles a one-day request against five on that day", () => {
    const others = Array.from({ length: 5 }, () =>
      range("2027-08-15", "2027-08-15")
    );
    expect(busiestDayCount(range("2027-08-15", "2027-08-15"), others)).toBe(5);
  });
});

describe("assertWithinRequestCaps", () => {
  const refusal = (fields: {
    openForContact: number;
    busiestVehicleDay: number;
  }) => {
    try {
      assertWithinRequestCaps(fields);
      return null;
    } catch (error) {
      if (!(error instanceof ConflictError)) throw error;
      return error;
    }
  };

  it("lets a request below both caps through", () => {
    expect(
      refusal({
        openForContact: MAX_OPEN_REQUESTS_PER_CONTACT - 1,
        busiestVehicleDay: MAX_OPEN_REQUESTS_PER_VEHICLE_DAY - 1,
      })
    ).toBeNull();
  });

  it("refuses the contact's next request once it has the maximum open, with a translatable 409", () => {
    const error = refusal({
      openForContact: MAX_OPEN_REQUESTS_PER_CONTACT,
      busiestVehicleDay: 0,
    });
    expect(error?.status).toBe(409);
    expect(error?.text).toEqual({
      key: "err.pendingLimitContact",
      values: { count: MAX_OPEN_REQUESTS_PER_CONTACT },
    });
  });

  it("refuses a car whose busiest day already holds the maximum", () => {
    const error = refusal({
      openForContact: 0,
      busiestVehicleDay: MAX_OPEN_REQUESTS_PER_VEHICLE_DAY,
    });
    expect(error?.text?.key).toBe("err.pendingLimitVehicle");
  });
});
