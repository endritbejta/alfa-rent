import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeMigration, splitStatements } from "./check-migrations.mjs";

const rules = (sql: string) => analyzeMigration(sql).map((p) => p.rule);

describe("splitStatements", () => {
  it("keeps a semicolon inside a dollar-quoted body in one statement", () => {
    const parts = splitStatements(
      "CREATE FUNCTION f() RETURNS void AS $$ BEGIN DELETE FROM x; END $$ LANGUAGE plpgsql;\nSELECT 1;"
    );
    expect(parts).toHaveLength(2);
    expect(parts[0].code).not.toContain("DELETE");
    expect(parts[1].line).toBe(2);
  });

  it("keeps a semicolon inside a string literal", () => {
    expect(splitStatements("SELECT ';';\nSELECT 2;")).toHaveLength(2);
  });

  it("gives a same-line trailing comment to the statement before it", () => {
    const [first, second] = splitStatements(
      "DROP INDEX a; -- note one\nSELECT 1;"
    );
    expect(first.text).toContain("note one");
    expect(second.text).not.toContain("note one");
  });
});

describe("destructive statements", () => {
  it.each([
    ['DROP TABLE "repairs";', "drop-table"],
    ['DROP TABLE IF EXISTS "repairs" CASCADE;', "drop-table"],
    ['ALTER TABLE "vehicles" DROP COLUMN "registrationDate";', "drop-column"],
    ['ALTER TABLE "vehicles" DROP "registrationDate";', "drop-column"],
    [
      'ALTER TABLE "vehicles" ALTER COLUMN "seats" DROP NOT NULL, DROP COLUMN "x";',
      "drop-column",
    ],
    [
      'ALTER TABLE "vehicles" ALTER COLUMN "seats" TYPE SMALLINT;',
      "alter-type",
    ],
    [
      'ALTER TABLE "vehicles" ALTER COLUMN "seats" SET DATA TYPE SMALLINT;',
      "alter-type",
    ],
    [
      'ALTER TABLE "users" DROP CONSTRAINT "users_email_key";',
      "drop-constraint",
    ],
    ['DROP INDEX "vehicles_status_idx";', "drop-index"],
    ['DROP INDEX CONCURRENTLY IF EXISTS "x";', "drop-index"],
    ['TRUNCATE "rate_limits";', "truncate"],
    ['DELETE FROM "rate_limits" WHERE "expiresAt" < now();', "delete-from"],
    ["delete from rate_limits;", "delete-from"],
  ])("flags %s", (sql, rule) => {
    expect(rules(sql)).toContain(rule);
  });

  it.each([
    'ALTER TABLE "vehicles" ADD COLUMN "vin" TEXT;',
    'ALTER TABLE "vehicles" ALTER COLUMN "seats" DROP NOT NULL;',
    'ALTER TABLE "vehicles" ALTER COLUMN "seats" DROP DEFAULT;',
    'CREATE INDEX "x" ON "vehicles" ("status");',
    "ALTER TYPE \"Role\" ADD VALUE 'MANAGER';",
    'CREATE TRIGGER t BEFORE TRUNCATE ON "audit_events" FOR EACH STATEMENT EXECUTE FUNCTION f();',
    'CREATE TRIGGER t BEFORE DELETE ON "audit_events" FOR EACH ROW EXECUTE FUNCTION f();',
    "-- DROP TABLE users; only a comment\nSELECT 1;",
    "/* DELETE FROM users; */ SELECT 1;",
    "SELECT 'DROP TABLE users';",
    "CREATE FUNCTION f() RETURNS trigger AS $body$ BEGIN DELETE FROM x; RETURN NULL; END $body$ LANGUAGE plpgsql;",
  ])("passes %s", (sql) => {
    expect(analyzeMigration(sql)).toEqual([]);
  });

  it("accepts a marker on the line above", () => {
    expect(
      rules(
        '-- migration-safety: allow retired in October, data exported first\nALTER TABLE "vehicles" DROP COLUMN "registrationDate";'
      )
    ).toEqual([]);
  });

  it("accepts a marker at the end of the statement's line", () => {
    expect(
      rules(
        'DELETE FROM "rate_limits"; -- migration-safety: allow expired rows only'
      )
    ).toEqual([]);
  });

  it("accepts a marker inside a multi-line statement", () => {
    expect(
      rules(
        'ALTER TABLE "vehicles"\n  -- migration-safety: allow column retired\n  DROP COLUMN "x";'
      )
    ).toEqual([]);
  });

  it("does not let a marker carry over to the next statement", () => {
    const sql =
      '-- migration-safety: allow first one only\nDROP INDEX "a";\nDROP INDEX "b";';
    const problems = analyzeMigration(sql);
    expect(problems).toHaveLength(1);
    expect(problems[0].line).toBe(3);
  });

  it("refuses a marker without a reason", () => {
    const [problem] = analyzeMigration(
      '-- migration-safety: allow\nDROP INDEX "a";'
    );
    expect(problem.rule).toBe("drop-index");
    expect(problem.message).toMatch(/needs a reason/);
  });

  it("reports the statement's line, not the comment's", () => {
    const [problem] = analyzeMigration(
      'SELECT 1;\n\n-- tidy up\nDROP TABLE "x";'
    );
    expect(problem.line).toBe(4);
  });
});

describe("protected objects", () => {
  const allow = "-- migration-safety: allow rewriting it\n";

  it.each([
    [
      'ALTER TABLE "reservations" DROP CONSTRAINT "reservations_no_overlap";',
      "protected-no-overlap",
    ],
    [
      "ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_no_overlap;",
      "protected-no-overlap",
    ],
    ['DROP TABLE "reservations";', "protected-no-overlap"],
    ["DROP EXTENSION IF EXISTS btree_gist CASCADE;", "protected-btree-gist"],
    ['ALTER TABLE public."users" DISABLE ROW LEVEL SECURITY;', "protected-rls"],
    ['ALTER TABLE "users" NO FORCE ROW LEVEL SECURITY;', "protected-rls"],
    [
      'ALTER TABLE "rental_inspections" DROP CONSTRAINT "rental_inspections_mileage_check";',
      "protected-inspection-checks",
    ],
    ['DROP TABLE "rental_inspections";', "protected-inspection-checks"],
  ])("fails %s even with a marker", (sql, rule) => {
    expect(rules(allow + sql)).toEqual([rule]);
  });

  it("allows reservations_no_overlap rewritten in the same migration", () => {
    const sql = `${allow}ALTER TABLE "reservations" DROP CONSTRAINT "reservations_no_overlap";
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_no_overlap"
EXCLUDE USING gist ("vehicleId" WITH =, daterange("pickupDate"::date, "returnDate"::date, '[]') WITH &&)
WHERE (status IN ('CONFIRMED', 'ACTIVE'));`;
    expect(analyzeMigration(sql)).toEqual([]);
  });

  it("does not count a recreation that comes before the drop", () => {
    const sql = `ALTER TABLE "reservations" ADD CONSTRAINT "reservations_no_overlap" EXCLUDE USING gist ("vehicleId" WITH =);
${allow}ALTER TABLE "reservations" DROP CONSTRAINT "reservations_no_overlap";`;
    expect(rules(sql)).toEqual(["protected-no-overlap"]);
  });

  it("does not count a different kind of constraint under the same name", () => {
    const sql = `${allow}ALTER TABLE "reservations" DROP CONSTRAINT "reservations_no_overlap";
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_no_overlap" CHECK (true);`;
    expect(rules(sql)).toEqual(["protected-no-overlap"]);
  });

  it("allows RLS switched back on for the same table only", () => {
    const back = `ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;
UPDATE "users" SET "active" = true;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;`;
    expect(analyzeMigration(back)).toEqual([]);

    const other = `ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "vehicles" ENABLE ROW LEVEL SECURITY;`;
    expect(rules(other)).toEqual(["protected-rls"]);
  });

  it("allows btree_gist dropped and created again", () => {
    expect(
      analyzeMigration(
        "DROP EXTENSION btree_gist;\nCREATE EXTENSION IF NOT EXISTS btree_gist;"
      )
    ).toEqual([]);
  });

  it("allows an inspection table rebuilt with both CHECKs", () => {
    const sql = `${allow}DROP TABLE "rental_inspections";
CREATE TABLE "rental_inspections" (
  "id" TEXT NOT NULL,
  CONSTRAINT "rental_inspections_fuel_level_check" CHECK ("fuelLevel" >= 0 AND "fuelLevel" <= 100),
  CONSTRAINT "rental_inspections_mileage_check" CHECK ("mileage" >= 0)
);`;
    expect(analyzeMigration(sql)).toEqual([]);
  });

  it("fails an inspection table rebuilt with one CHECK missing", () => {
    const sql = `${allow}DROP TABLE "rental_inspections";
CREATE TABLE "rental_inspections" (
  "id" TEXT NOT NULL,
  CONSTRAINT "rental_inspections_mileage_check" CHECK ("mileage" >= 0)
);`;
    expect(rules(sql)).toEqual(["protected-inspection-checks"]);
  });
});

describe("the real migrations", () => {
  const read = (name: string) =>
    readFileSync(
      path.join(__dirname, "..", "prisma", "migrations", name, "migration.sql"),
      "utf8"
    );

  it("would ask for a marker on the inclusive-days rewrite, but not refuse it", () => {
    // It drops reservations_no_overlap and recreates it on daterange: the
    // protected-object rule is satisfied; only the plain DROP CONSTRAINT
    // needs the reviewer's sentence. Existing migrations are grandfathered,
    // so this never runs in CI; it pins the behaviour on real SQL.
    expect(rules(read("20261113150000_inclusive_rental_days"))).toEqual([
      "drop-constraint",
    ]);
  });

  it("does not trip on the audit trail's TRUNCATE trigger or function bodies", () => {
    expect(analyzeMigration(read("20261113180000_audit_events"))).toEqual([]);
  });
});
