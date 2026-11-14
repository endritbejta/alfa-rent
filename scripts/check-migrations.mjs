#!/usr/bin/env node
/**
 * Migration-safety check (audit §8 item 12).
 *
 *   npm run check:migrations            compare against origin/main
 *   MIGRATION_BASE=<ref> npm run ...    compare against another ref
 *
 * Migrations here are written by hand and applied with `prisma migrate
 * deploy`, so nothing but review stands between a careless statement and the
 * production database. This script reads every migration.sql that is new or
 * changed relative to the base branch and fails on two kinds of statement:
 *
 * 1. Destructive ones — DROP TABLE, DROP COLUMN, a column TYPE change, DROP
 *    CONSTRAINT, DROP INDEX, TRUNCATE, DELETE FROM — unless the statement
 *    carries a marker comment on its own line(s) or directly above it:
 *
 *        -- migration-safety: allow <reason>
 *
 *    The reason is required: the marker exists so the PR shows a sentence a
 *    reviewer can disagree with, not so the check can be switched off.
 *
 * 2. Ones that remove the four safety objects schema.prisma does not model:
 *    the reservations_no_overlap exclusion constraint, the btree_gist
 *    extension, row-level security, and the rental_inspections CHECKs. These
 *    fail even with a marker, unless the same migration creates the object
 *    again (a constraint rewritten in place, say). They are the only real
 *    guarantee against double-booking and the only thing keeping Supabase's
 *    Data API out of the tables; see AGENTS.md.
 *
 * Migrations already on the base branch are grandfathered: several of them
 * legitimately drop columns or delete rows, and they have already run.
 *
 * The detection logic is pure and exported for scripts/check-migrations.test.ts.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MARKER = /--\s*migration-safety:\s*allow\b[ \t]*(.*)$/im;

/**
 * Splits SQL into statements, tracking the line each one starts on.
 *
 * Quoted strings, quoted identifiers and dollar-quoted bodies are kept intact
 * (a `;` inside a function body does not end the statement). String literals
 * and dollar-quoted bodies are blanked out of `code`, so a DELETE inside a
 * trigger function — which runs later, not now — or inside an error message
 * is not mistaken for one the migration executes.
 * Comments are dropped from `code` but kept in `text`, where markers live.
 * A comment on the same line after a statement's `;` belongs to it.
 *
 * @param {string} sql
 * @returns {{ text: string, code: string, line: number }[]}
 */
export function splitStatements(sql) {
  const statements = [];
  let text = "";
  let code = "";
  let line = 1;
  let startLine = null;
  let i = 0;

  const flush = () => {
    if (code.trim()) {
      statements.push({ text, code, line: startLine ?? line });
    } else if (statements.length && text.trim()) {
      // A trailing comment block with no statement after it: keep it with
      // the last statement so nothing silently disappears.
      statements[statements.length - 1].text += text;
    }
    text = "";
    code = "";
    startLine = null;
  };
  const markStart = () => {
    if (startLine === null) startLine = line;
  };

  while (i < sql.length) {
    const ch = sql[i];
    const rest = sql.slice(i);

    if (rest.startsWith("--")) {
      const end = sql.indexOf("\n", i);
      const comment = end === -1 ? rest : sql.slice(i, end);
      text += comment;
      i += comment.length;
      continue;
    }
    if (rest.startsWith("/*")) {
      const end = sql.indexOf("*/", i + 2);
      const comment = end === -1 ? rest : sql.slice(i, end + 2);
      text += comment;
      line += comment.split("\n").length - 1;
      i += comment.length;
      continue;
    }
    if (ch === "'" || ch === '"') {
      markStart();
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === ch && sql[j + 1] === ch) j += 2;
        else if (sql[j] === ch) break;
        else j += 1;
      }
      const quoted = sql.slice(i, j + 1);
      text += quoted;
      // Identifiers stay readable; string contents are data, not SQL.
      code += ch === '"' ? quoted : "''";
      line += quoted.split("\n").length - 1;
      i = j + 1;
      continue;
    }
    const dollar = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(rest);
    if (dollar) {
      markStart();
      const tag = dollar[0];
      const end = sql.indexOf(tag, i + tag.length);
      const body = end === -1 ? rest : sql.slice(i, end + tag.length);
      text += body;
      code += `${tag}${tag}`;
      line += body.split("\n").length - 1;
      i += body.length;
      continue;
    }
    if (ch === ";") {
      text += ch;
      code += ch;
      i += 1;
      // Same-line trailing comment: `DROP INDEX x; -- migration-safety: ...`
      const trailing = /^[ \t]*--[^\n]*/.exec(sql.slice(i));
      if (trailing) {
        text += trailing[0];
        i += trailing[0].length;
      }
      flush();
      continue;
    }
    if (ch === "\n") line += 1;
    else if (!/\s/.test(ch)) markStart();
    text += ch;
    code += ch;
    i += 1;
  }
  flush();
  return statements;
}

const ident = String.raw`(?:"[^"]+"|[A-Za-z_][\w$]*)`;
const qualified = String.raw`(?:${ident}\s*\.\s*)?${ident}`;
const unquote = (name) => name.replace(/"/g, "").split(".").pop().trim();

/** Destructive statements that need a marker. */
const DESTRUCTIVE = [
  {
    rule: "drop-table",
    test: (c) => /\bDROP\s+TABLE\b/i.test(c),
    message: "DROP TABLE deletes the table and every row in it",
  },
  {
    rule: "drop-column",
    // `DROP [COLUMN] name` inside ALTER TABLE, but not DROP CONSTRAINT,
    // DROP DEFAULT, DROP NOT NULL, DROP IDENTITY or DROP EXPRESSION, which
    // lose no data.
    test: (c) =>
      /\bALTER\s+TABLE\b/i.test(c) &&
      /\bDROP\s+(?!CONSTRAINT\b|DEFAULT\b|NOT\s+NULL\b|IDENTITY\b|EXPRESSION\b)(?:COLUMN\b)?/i.test(
        c
      ),
    message: "DROP COLUMN deletes that column's data in every row",
  },
  {
    rule: "alter-type",
    test: (c) =>
      new RegExp(
        String.raw`\bALTER\s+(?:COLUMN\s+)?${ident}\s+(?:SET\s+DATA\s+)?TYPE\b`,
        "i"
      ).test(c) && /\bALTER\s+TABLE\b/i.test(c),
    message:
      "changing a column's TYPE rewrites the table and can truncate or reject existing values",
  },
  {
    rule: "drop-constraint",
    test: (c) => /\bDROP\s+CONSTRAINT\b/i.test(c),
    message: "DROP CONSTRAINT removes a guarantee the data relies on",
  },
  {
    rule: "drop-index",
    test: (c) => /\bDROP\s+INDEX\b/i.test(c),
    message:
      "DROP INDEX can remove a uniqueness guarantee or the index a hot query needs",
  },
  {
    rule: "truncate",
    // A statement, not the TRUNCATE event a trigger fires on.
    test: (c) => /^\s*TRUNCATE\b/i.test(c),
    message: "TRUNCATE deletes every row",
  },
  {
    rule: "delete-from",
    test: (c) => /\bDELETE\s+FROM\b/i.test(c),
    message: "DELETE FROM deletes rows",
  },
];

/**
 * The four objects schema.prisma does not model. `drops` finds a statement
 * that removes one; `recreates` finds one that puts it back.
 */
const INSPECTION_CHECKS = [
  "rental_inspections_fuel_level_check",
  "rental_inspections_mileage_check",
];

function dropsTable(code, table) {
  const m = new RegExp(
    String.raw`\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([^;]+)`,
    "i"
  ).exec(code);
  if (!m) return false;
  return m[1]
    .split(",")
    .map((part) => unquote(part.replace(/\b(CASCADE|RESTRICT)\b/gi, "")))
    .includes(table);
}

function droppedConstraint(code) {
  const m = new RegExp(
    String.raw`\bDROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?(${ident})`,
    "i"
  ).exec(code);
  return m ? unquote(m[1]) : null;
}

function addsConstraint(code, name, kind) {
  return new RegExp(
    String.raw`\bCONSTRAINT\s+"?${name}"?\s+${kind}\b`,
    "i"
  ).test(code);
}

/** Tables whose RLS a statement turns off, by name. */
function rlsDisabledOn(code) {
  const m = new RegExp(
    String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(${qualified})\s+(?:DISABLE|NO\s+FORCE)\s+ROW\s+LEVEL\s+SECURITY\b`,
    "i"
  ).exec(code);
  return m ? unquote(m[1]) : null;
}

function rlsEnabledOn(code) {
  const m = new RegExp(
    String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(${qualified})\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY\b`,
    "i"
  ).exec(code);
  return m ? unquote(m[1]) : null;
}

export const PROTECTED = [
  {
    rule: "protected-no-overlap",
    object: "reservations_no_overlap",
    drops: (c) =>
      droppedConstraint(c) === "reservations_no_overlap" ||
      dropsTable(c, "reservations"),
    recreates: (c) => addsConstraint(c, "reservations_no_overlap", "EXCLUDE"),
    message:
      "removes the reservations_no_overlap exclusion constraint, the only guarantee against double-booking",
  },
  {
    rule: "protected-btree-gist",
    object: "btree_gist",
    drops: (c) => /\bDROP\s+EXTENSION\b[^;]*\bbtree_gist\b/i.test(c),
    recreates: (c) => /\bCREATE\s+EXTENSION\b[^;]*\bbtree_gist\b/i.test(c),
    message:
      "drops the btree_gist extension, which reservations_no_overlap depends on",
  },
  {
    rule: "protected-rls",
    object: "row-level security",
    drops: (c) => rlsDisabledOn(c) !== null,
    // RLS is per table: only re-enabling the same table counts.
    recreates: (c, dropped) => {
      const table = rlsDisabledOn(dropped);
      return table !== null && rlsEnabledOn(c) === table;
    },
    message:
      "turns off row-level security, which keeps Supabase's Data API roles out of the table",
  },
  {
    rule: "protected-inspection-checks",
    object: "rental_inspections CHECK constraints",
    drops: (c) =>
      INSPECTION_CHECKS.includes(droppedConstraint(c) ?? "") ||
      dropsTable(c, "rental_inspections"),
    recreates: (c, dropped) => {
      const name = droppedConstraint(dropped);
      const names = name ? [name] : INSPECTION_CHECKS;
      return names.every((n) => addsConstraint(c, n, "CHECK"));
    },
    message:
      "removes a rental_inspections CHECK constraint (fuel level 0–100, mileage ≥ 0)",
  },
];

/**
 * @param {string} sql
 * @returns {{ line: number, rule: string, message: string, statement: string }[]}
 */
export function analyzeMigration(sql) {
  const statements = splitStatements(sql);
  const problems = [];
  const snippet = (s) => s.code.trim().replace(/\s+/g, " ").slice(0, 120);

  statements.forEach((statement, index) => {
    const { code, text, line } = statement;
    const marker = MARKER.exec(text);
    const reason = marker?.[1]?.trim() ?? "";

    for (const check of PROTECTED) {
      if (!check.drops(code)) continue;
      const later = statements.slice(index + 1);
      if (later.some((s) => check.recreates(s.code, code))) continue;
      problems.push({
        line,
        rule: check.rule,
        message: `${check.message}. A marker does not allow this; recreate ${check.object} in the same migration, or don't drop it.`,
        statement: snippet(statement),
      });
    }

    for (const check of DESTRUCTIVE) {
      if (!check.test(code)) continue;
      if (marker && reason) continue;
      problems.push({
        line,
        rule: check.rule,
        message: marker
          ? `${check.message}; the migration-safety marker needs a reason after "allow"`
          : `${check.message}. If it is intended, add "-- migration-safety: allow <reason>" on or above the statement`,
        statement: snippet(statement),
      });
    }
  });

  return problems;
}

// ---------------------------------------------------------------- git side

const git = (args, cwd) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const refExists = (ref, cwd) => {
  try {
    git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], cwd);
    return true;
  } catch {
    return false;
  }
};

const MIGRATION_FILE = /^prisma\/migrations\/[^/]+\/migration\.sql$/;

/**
 * The migration files that are new or changed relative to `base`, including
 * uncommitted and untracked ones, so a local run sees work in progress.
 */
export function changedMigrations(cwd, base) {
  const files = new Set();
  const mergeBase = git(["merge-base", base, "HEAD"], cwd);
  git(
    [
      "diff",
      "--name-only",
      "--diff-filter=ACMR",
      mergeBase,
      "--",
      "prisma/migrations",
    ],
    cwd
  )
    .split("\n")
    .forEach((f) => f && files.add(f));
  git(
    ["ls-files", "--others", "--exclude-standard", "--", "prisma/migrations"],
    cwd
  )
    .split("\n")
    .forEach((f) => f && files.add(f));
  return [...files].filter((f) => MIGRATION_FILE.test(f)).sort();
}

function resolveBase(cwd) {
  const candidates = [
    process.env.MIGRATION_BASE,
    process.env.GITHUB_BASE_REF && `origin/${process.env.GITHUB_BASE_REF}`,
    "origin/main",
    "main",
  ].filter((ref) => ref && !/^0+$/.test(ref));
  for (const ref of candidates) if (refExists(ref, cwd)) return ref;
  return null;
}

function main() {
  const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const base = resolveBase(cwd);
  if (!base) {
    console.error(
      "check-migrations: no base ref found (tried MIGRATION_BASE, origin/$GITHUB_BASE_REF, origin/main, main). " +
        "In CI, check out with fetch-depth: 0."
    );
    process.exit(2);
  }

  const files = changedMigrations(cwd, base);
  if (files.length === 0) {
    console.log(
      `check-migrations: no new or changed migrations since ${base}.`
    );
    return;
  }

  let failed = 0;
  for (const file of files) {
    const full = path.join(cwd, file);
    if (!existsSync(full)) continue;
    const problems = analyzeMigration(readFileSync(full, "utf8"));
    if (problems.length === 0) {
      console.log(`ok    ${file}`);
      continue;
    }
    failed += problems.length;
    for (const p of problems) {
      console.log(
        `FAIL  ${file}:${p.line}  [${p.rule}] ${p.message}\n        ${p.statement}`
      );
      if (process.env.GITHUB_ACTIONS) {
        console.log(
          `::error file=${file},line=${p.line},title=migration-safety ${p.rule}::${p.message}`
        );
      }
    }
  }

  if (failed) {
    console.error(
      `\ncheck-migrations: ${failed} problem(s) in migrations new since ${base}.`
    );
    process.exit(1);
  }
  console.log(
    `check-migrations: ${files.length} migration(s) checked against ${base}.`
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
