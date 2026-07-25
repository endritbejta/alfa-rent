import { describe, expect, it } from "vitest";
import { rentalInspectionSchema } from "./inspection";

const valid = {
  type: "PICKUP" as const,
  mileage: 82_450,
  fuelLevel: 75,
  damageFound: false,
  signerName: "Arben Krasniqi",
  customerAcknowledged: true as const,
  photos: [],
};

describe("rentalInspectionSchema", () => {
  it("accepts a complete inspection", () => {
    expect(rentalInspectionSchema.parse(valid)).toMatchObject(valid);
  });

  it("requires damage notes when damage is recorded", () => {
    expect(() =>
      rentalInspectionSchema.parse({ ...valid, damageFound: true })
    ).toThrow("Describe the damage");
  });

  it("rejects impossible fuel levels", () => {
    expect(() =>
      rentalInspectionSchema.parse({ ...valid, fuelLevel: 105 })
    ).toThrow();
  });

  it("requires customer acknowledgement", () => {
    expect(() =>
      rentalInspectionSchema.parse({
        ...valid,
        customerAcknowledged: false,
      })
    ).toThrow("Customer acknowledgement");
  });
});
