import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

const body = (csv: string) => csv.replace(/^\uFEFF/, "");

describe("toCsv", () => {
  it("starts with a byte-order mark and ends rows with CRLF", () => {
    const csv = toCsv([
      ["a", 1],
      ["b", 2],
    ]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(body(csv)).toBe("a,1\r\nb,2\r\n");
  });

  it("quotes fields with commas, quotes and line breaks", () => {
    expect(body(toCsv([['Rio, "red"', "two\nlines"]]))).toBe(
      '"Rio, ""red""","two\nlines"\r\n'
    );
  });

  it("neutralises text a spreadsheet would run as a formula", () => {
    expect(body(toCsv([["=HYPERLINK(1)", "+1 cmd", "@SUM", "-x"]]))).toBe(
      "'=HYPERLINK(1),'+1 cmd,'@SUM,'-x\r\n"
    );
  });

  it("keeps negative amounts and numbers as numbers", () => {
    expect(body(toCsv([["-12.50", -3, "Ëndrra"]]))).toBe(
      "-12.50,-3,Ëndrra\r\n"
    );
  });
});
