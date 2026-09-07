import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WCAG contrast, computed from the tokens rather than eyeballed.
 *
 * Dark mode had four failures at once, and none of them were visible from
 * reading the file: a white label on the lightened brand red measured
 * 3.61:1 against the 4.5 that AA asks of 14px text, 3.00:1 on the hover
 * fill, 3.24:1 on the confirm green, and the low-alpha white border on form
 * fields read 1.62:1 against the 3:1 that 1.4.11 asks of a non-text
 * boundary — so in dark, form fields had effectively no border at all.
 *
 * Light mode passed everything, and its `--input` comment explains exactly
 * the problem dark had reverted on. Hence this: the ratios are now asserted
 * so a token edit that breaks one fails the suite instead of shipping.
 */
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

function tokens(selector: string): Record<string, string> {
  const at = css.indexOf(`\n${selector} {`);
  if (at === -1) throw new Error(`no ${selector} block in globals.css`);
  const body = css.slice(at, css.indexOf("\n}", at));
  const found: Record<string, string> = {};
  for (const [, name, value] of body.matchAll(/^\s*--([\w-]+):\s*([^;]+);/gm)) {
    found[name] = value.trim();
  }
  return found;
}

const channels = (hex: string): [number, number, number] => {
  const raw = hex.replace("#", "").trim();
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`not a hex colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
};

const luminance = (hex: string): number => {
  const linear = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
};

const contrast = (a: string, b: string): number => {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter! + 0.05) / (darker! + 0.05);
};

/** AA for text under 18.66px bold / 24px regular, which is all of ours. */
const TEXT = 4.5;
/** WCAG 1.4.11: a control boundary against its neighbour. */
const NON_TEXT = 3;

describe.each([
  ["light", ":root"],
  ["dark", ".dark"],
])("%s theme contrast", (_theme, selector) => {
  const t = tokens(selector);
  const at = (name: string) => {
    const value = t[name];
    if (!value) throw new Error(`${selector} does not define --${name}`);
    return value;
  };

  it("labels the primary button legibly, at rest and hovered", () => {
    expect(
      contrast(at("primary-foreground"), at("primary"))
    ).toBeGreaterThanOrEqual(TEXT);
    expect(
      contrast(at("primary-foreground"), at("brand-hover"))
    ).toBeGreaterThanOrEqual(TEXT);
  });

  it("labels the confirm button legibly, at rest and hovered", () => {
    expect(
      contrast(at("success-foreground"), at("success"))
    ).toBeGreaterThanOrEqual(TEXT);
    expect(
      contrast(at("success-foreground"), at("success-hover"))
    ).toBeGreaterThanOrEqual(TEXT);
  });

  it("gives a form field a boundary you can see on both grounds", () => {
    expect(contrast(at("input"), at("card"))).toBeGreaterThanOrEqual(NON_TEXT);
    expect(contrast(at("input"), at("background"))).toBeGreaterThanOrEqual(
      NON_TEXT
    );
  });

  it("keeps body and muted text well clear of the minimum", () => {
    expect(contrast(at("foreground"), at("background"))).toBeGreaterThanOrEqual(
      TEXT
    );
    expect(contrast(at("card-foreground"), at("card"))).toBeGreaterThanOrEqual(
      TEXT
    );
    expect(contrast(at("muted-foreground"), at("card"))).toBeGreaterThanOrEqual(
      TEXT
    );
  });

  it("keeps the filled buttons distinguishable from the surface behind them", () => {
    expect(contrast(at("primary"), at("card"))).toBeGreaterThanOrEqual(
      NON_TEXT
    );
    expect(contrast(at("success"), at("card"))).toBeGreaterThanOrEqual(
      NON_TEXT
    );
  });
});
