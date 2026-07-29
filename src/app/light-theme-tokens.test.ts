import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const globals = readFileSync(join(root, "src/app/globals.css"), "utf8");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.(ts|tsx)$/.test(path) || path.endsWith(".test.ts")) return [];
    return [path];
  });
}

function luminance(hex: string) {
  const channels = hex
    .replace("#", "")
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground: string, background: string) {
  const values = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a
  );
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe("light theme design tokens", () => {
  it("uses the background token as the single canvas source", () => {
    expect(globals).toContain("--ambient-canvas: var(--background);");
    expect(globals).not.toContain("--glass-card-fill");
  });

  it("defines the shared surface and state roles", () => {
    for (const token of [
      "--color-control:",
      "--color-divider:",
      "--color-surface-hover:",
      "--color-surface-selected:",
      "--color-skeleton:",
      "--color-overlay-soft:",
      "--color-overlay-modal:",
      "--color-media:",
    ]) {
      expect(globals).toContain(token);
    }
  });

  it("keeps small inactive status text at WCAG AA contrast", () => {
    const inactive = globals.match(/--st-inactive:\s*(#[0-9a-f]{6})/i)?.[1];
    expect(inactive).toBeDefined();
    expect(contrast(inactive!, "#f4f2f1")).toBeGreaterThanOrEqual(4.5);
  });

  it("does not reintroduce bypassed neutral or elevation recipes", () => {
    const files = [
      ...sourceFiles(join(root, "src/app")),
      ...sourceFiles(join(root, "src/components")),
    ];
    const violations = files.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return [
        /\b(?:bg|text|border)-neutral-\d+\b/.test(source) &&
          "raw neutral utility",
        /\bshadow-(?:xl|2xl)\b/.test(source) && "unapproved elevation",
        /hover:bg-\[#[0-9a-f]{3,8}\]/i.test(source) && "hardcoded hover color",
        /\bglass-card\b/.test(source) && "obsolete glass card",
      ]
        .filter(Boolean)
        .map((reason) => `${file}: ${reason}`);
    });

    expect(violations).toEqual([]);
  });
});
