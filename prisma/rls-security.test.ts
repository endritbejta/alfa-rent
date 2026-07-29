import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const prismaDirectory = resolve(process.cwd(), "prisma");
const schema = readFileSync(resolve(prismaDirectory, "schema.prisma"), "utf8");
const migrationsDirectory = resolve(prismaDirectory, "migrations");
const migrationSql = readdirSync(migrationsDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) =>
    readFileSync(
      resolve(migrationsDirectory, entry.name, "migration.sql"),
      "utf8"
    )
  )
  .join("\n");

const mappedTables = [...schema.matchAll(/@@map\("([^"]+)"\)/g)].map(
  ([, table]) => table
);

describe("Supabase public schema security", () => {
  it.each(mappedTables)("enables RLS for %s", (table) => {
    expect(migrationSql).toContain(
      `ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY`
    );
  });

  it("protects Prisma migration metadata and removes Data API defaults", () => {
    expect(migrationSql).toContain(
      'ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY'
    );
    expect(migrationSql).toContain(
      "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public"
    );
    expect(migrationSql).toContain(
      "ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES"
    );
  });
});
