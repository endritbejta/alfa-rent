import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";

/**
 * Asserts that the database objects `schema.prisma` does not model actually
 * exist in a live database.
 *
 * `prisma/rls-security.test.ts` checks that the SQL was *written*; CI proves it
 * *applies* to a fresh database. Neither notices if the objects are later
 * dropped — which is exactly what `prisma migrate dev`, `migrate reset` and
 * `db push` do, because they regenerate the schema from the model and the model
 * knows nothing about any of this. Four things would go silently:
 *
 *   - the reservations_no_overlap GiST exclusion constraint, which is the only
 *     real guarantee against double-booking
 *   - the btree_gist extension it depends on
 *   - row-level security on every table
 *   - two CHECK constraints on rental_inspections
 *
 * The table list is derived from schema.prisma's @@map declarations, following
 * rls-security.test.ts, so a new model is covered without editing this file.
 */
const schema = readFileSync(
  resolve(process.cwd(), "prisma", "schema.prisma"),
  "utf8"
);
const mappedTables = [...schema.matchAll(/@@map\("([^"]+)"\)/g)].map(
  ([, table]) => table
);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("database objects that schema.prisma does not model", () => {
  it("has at least the ten tables we expect to derive", () => {
    // Guards the derivation itself: a regex that silently matched nothing
    // would make every test below vacuously pass.
    expect(mappedTables.length).toBeGreaterThanOrEqual(10);
  });

  it("keeps the reservations_no_overlap exclusion constraint", async () => {
    const rows = await prisma.$queryRaw<{ contype: string }[]>`
      SELECT contype::text FROM pg_constraint
      WHERE conname = 'reservations_no_overlap'
    `;
    expect(rows).toHaveLength(1);
    // 'x' is an exclusion constraint. A plain unique or check would not stop
    // overlapping ranges.
    expect(rows[0]!.contype).toBe("x");
  });

  it("keeps the btree_gist extension the constraint depends on", async () => {
    const rows = await prisma.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'btree_gist'
    `;
    expect(rows).toHaveLength(1);
  });

  it.each(mappedTables)(
    "has row-level security enabled on %s",
    async (table) => {
      const rows = await prisma.$queryRaw<{ relrowsecurity: boolean }[]>`
      SELECT relrowsecurity FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relkind = 'r'
        AND relname = ${table}
    `;
      expect(rows).toHaveLength(1);
      expect(rows[0]!.relrowsecurity).toBe(true);
    }
  );

  it("keeps both CHECK constraints on rental_inspections", async () => {
    const rows = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'rental_inspections'::regclass AND contype = 'c'
    `;
    const names = rows.map((r) => r.conname);
    expect(names).toContain("rental_inspections_fuel_level_check");
    expect(names).toContain("rental_inspections_mileage_check");
  });
});
