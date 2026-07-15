import { describe, expect, it } from "vitest";
import { availabilitySchema, createBookingSchema } from "./reservation";

const future = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

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
