import { afterEach, describe, expect, it, vi } from "vitest";
import {
  availabilitySchema,
  createBookingSchema,
  MAX_BOOKING_HORIZON_DAYS,
  MAX_RENTAL_DAYS,
} from "./reservation";

const future = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

afterEach(() => vi.useRealTimers());

describe("availabilitySchema", () => {
  it("accepts a valid future range and coerces ISO strings to dates", () => {
    const parsed = availabilitySchema.parse({
      vehicleId: "v1",
      pickupDate: future(2),
      returnDate: future(5),
    });
    expect(parsed.pickupDate).toBeInstanceOf(Date);
  });

  it("rejects return before pickup", () => {
    expect(() =>
      availabilitySchema.parse({
        vehicleId: "v1",
        pickupDate: future(5),
        returnDate: future(2),
      })
    ).toThrow();
  });

  it("rejects a pickup in the past", () => {
    expect(() =>
      availabilitySchema.parse({
        vehicleId: "v1",
        pickupDate: future(-3),
        returnDate: future(2),
      })
    ).toThrow();
  });

  it("rejects yesterday by the branch calendar even when it is less than 24 hours ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T08:00:00.000Z"));
    expect(() =>
      availabilitySchema.parse({
        vehicleId: "v1",
        pickupDate: "2026-07-23T10:00:00.000Z",
        returnDate: "2026-07-25T10:00:00.000Z",
      })
    ).toThrow(/past/);
  });

  it("bounds both the booking horizon and rental duration", () => {
    expect(() =>
      availabilitySchema.parse({
        vehicleId: "v1",
        pickupDate: future(MAX_BOOKING_HORIZON_DAYS + 2),
        returnDate: future(MAX_BOOKING_HORIZON_DAYS + 4),
      })
    ).toThrow(/within/);

    expect(() =>
      availabilitySchema.parse({
        vehicleId: "v1",
        pickupDate: future(2),
        returnDate: future(MAX_RENTAL_DAYS + 3),
      })
    ).toThrow(/duration/);
  });
});

describe("createBookingSchema", () => {
  const valid = {
    vehicleId: "v1",
    pickupDate: future(2),
    returnDate: future(5),
    customer: {
      firstName: "Arta",
      lastName: "Krasniqi",
      email: "arta@example.com",
      phone: "+383 44 123 456",
    },
  };

  it("accepts a valid booking", () => {
    expect(createBookingSchema.parse(valid).customer.email).toBe(
      "arta@example.com"
    );
  });

  it("rejects an invalid email", () => {
    expect(() =>
      createBookingSchema.parse({
        ...valid,
        customer: { ...valid.customer, email: "not-an-email" },
      })
    ).toThrow();
  });
});
