import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRepairFields, REPAIR_FIELD_NAMES, repairSchema } from "./repair";

const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
};

const complete = {
  [REPAIR_FIELD_NAMES.date]: "2026-08-01",
  [REPAIR_FIELD_NAMES.cost]: "250.50",
  [REPAIR_FIELD_NAMES.description]: "Replaced front brake pads",
  [REPAIR_FIELD_NAMES.reference]: "INV-1234",
  [REPAIR_FIELD_NAMES.notes]: "Both sides",
};

describe("parseRepairFields", () => {
  it("reads and coerces a complete repair", () => {
    const input = parseRepairFields(form(complete));
    expect(input.cost).toBe(250.5);
    expect(input.description).toBe("Replaced front brake pads");
    expect(input.reference).toBe("INV-1234");
    expect(input.notes).toBe("Both sides");
    expect(input.date.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("treats blank optional fields as absent, not as empty strings", () => {
    const input = parseRepairFields(
      form({
        ...complete,
        [REPAIR_FIELD_NAMES.reference]: "",
        [REPAIR_FIELD_NAMES.notes]: "",
      })
    );
    expect(input.reference).toBeUndefined();
    expect(input.notes).toBeUndefined();
  });

  it("rejects a cost of zero or less", () => {
    expect(() =>
      parseRepairFields(form({ ...complete, [REPAIR_FIELD_NAMES.cost]: "0" }))
    ).toThrow();
  });

  it("rejects a description too short to be useful", () => {
    expect(() =>
      parseRepairFields(
        form({ ...complete, [REPAIR_FIELD_NAMES.description]: "ok" })
      )
    ).toThrow();
  });

  /**
   * The panel renders inside VehicleForm's <form>, so an unprefixed name is a
   * second field of that name in one form and only DOM order decides which one
   * a vehicle save reads. `description` was exactly that collision.
   */
  it("prefixes every posted name so none can collide with a vehicle field", () => {
    for (const name of Object.values(REPAIR_FIELD_NAMES)) {
      expect(name.startsWith("repair-")).toBe(true);
    }
  });

  it("covers every key the schema requires", () => {
    // If a field is added to repairSchema and not to REPAIR_FIELD_NAMES, the
    // `satisfies` in repair.ts fails to compile; this catches the reverse and
    // keeps the two in step at runtime too.
    const schemaKeys = Object.keys(repairSchema.shape).sort();
    expect(Object.keys(REPAIR_FIELD_NAMES).sort()).toEqual(schemaKeys);
  });

  /**
   * The reader and the markup are separate files. This is the one thing a
   * pure test cannot see: that the component actually posts these names.
   */
  it("is the only source of the names the panel renders", () => {
    const panel = readFileSync(
      resolve(
        process.cwd(),
        "src/app/(dashboard)/admin/vehicles/[id]/edit/repairs.tsx"
      ),
      "utf8"
    );
    expect(panel).toContain("REPAIR_FIELD_NAMES");
    // A hardcoded name would mean the panel and the reader can drift again.
    for (const name of Object.values(REPAIR_FIELD_NAMES)) {
      expect(panel).not.toContain(`"${name}"`);
    }
  });
});
