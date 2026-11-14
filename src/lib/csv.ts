/**
 * Rows as RFC 4180 CSV, ready to open in a spreadsheet.
 *
 * - Fields with a comma, quote or line break are quoted, quotes doubled.
 * - Text that a spreadsheet would run as a formula (`=`, `+`, `-`, `@`, tab,
 *   carriage return at the start) gets a leading apostrophe. Vehicle and
 *   customer names are typed by people, and "=HYPERLINK(…)" in a name must
 *   stay a name. Numbers are passed as numbers and are never prefixed, so
 *   a negative amount stays a number.
 * - A UTF-8 byte-order mark makes Excel read "ë" and "ç" as such.
 * - CRLF line ends, as the RFC asks and Excel expects.
 */
export function toCsv(rows: (string | number)[][]): string {
  return `\uFEFF${rows.map((row) => row.map(field).join(",")).join("\r\n")}\r\n`;
}

const FORMULA_START = /^[=+\-@\t\r]/;

function field(value: string | number): string {
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : "";
  // Amounts arrive as strings ("12.50", "-3.00") so they keep their cents;
  // a plain number string is data, not a formula.
  const safe =
    FORMULA_START.test(value) && !/^-?\d+(\.\d+)?$/.test(value)
      ? `'${value}`
      : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
