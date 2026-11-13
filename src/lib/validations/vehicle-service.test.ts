import { describe, expect, it } from "vitest";
import {
  parseVehicleServiceFields,
  SERVICE_FIELD_NAMES,
} from "./vehicle-service";

const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
};

const complete = {
  [SERVICE_FIELD_NAMES.date]: "2026-08-01",
  [SERVICE_FIELD_NAMES.cost]: "89.90",
  [SERVICE_FIELD_NAMES.mileage]: "41200",
  [SERVICE_FIELD_NAMES.notes]: "Oil and filters",
};

describe("parseVehicleServiceFields", () => {
  it("reads and coerces a complete service", () => {
    const input = parseVehicleServiceFields(form(complete));
    expect(input).toEqual({
      date: new Date("2026-08-01T00:00:00.000Z"),
      cost: 89.9,
      mileage: 41200,
      notes: "Oil and filters",
    });
  });

  it("treats blank optional fields as absent, never 0 km", () => {
    const input = parseVehicleServiceFields(
      form({
        ...complete,
        [SERVICE_FIELD_NAMES.mileage]: "",
        [SERVICE_FIELD_NAMES.notes]: "  ",
      })
    );
    expect(input.mileage).toBeUndefined();
    expect(input.notes).toBeUndefined();
  });

  it("treats optional fields that were not posted as absent", () => {
    const input = parseVehicleServiceFields(
      form({
        [SERVICE_FIELD_NAMES.date]: "2026-08-01",
        [SERVICE_FIELD_NAMES.cost]: "60",
      })
    );
    expect(input.mileage).toBeUndefined();
    expect(input.notes).toBeUndefined();
  });

  it("allows a free service (under warranty) but not a negative one", () => {
    expect(
      parseVehicleServiceFields(
        form({ ...complete, [SERVICE_FIELD_NAMES.cost]: "0" })
      ).cost
    ).toBe(0);
    expect(() =>
      parseVehicleServiceFields(
        form({ ...complete, [SERVICE_FIELD_NAMES.cost]: "-1" })
      )
    ).toThrow();
  });

  it.each([SERVICE_FIELD_NAMES.date, SERVICE_FIELD_NAMES.cost])(
    "requires %s",
    (field) => {
      expect(() =>
        parseVehicleServiceFields(form({ ...complete, [field]: "" }))
      ).toThrow();
    }
  );

  it("refuses a fractional or negative mileage", () => {
    for (const mileage of ["1.5", "-3"]) {
      expect(() =>
        parseVehicleServiceFields(
          form({ ...complete, [SERVICE_FIELD_NAMES.mileage]: mileage })
        )
      ).toThrow();
    }
  });
});
