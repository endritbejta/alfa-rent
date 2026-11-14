import { describe, expect, it } from "vitest";
import { getScriptNonceFromHeader } from "next/dist/server/app-render/get-script-nonce-from-header";
import {
  baselineDirectives,
  createNonce,
  cspEnforced,
  CSP_ORIGINS,
  framingFor,
  isFramingDenied,
  nonceCsp,
  proxySecurityHeaders,
  staticSecurityHeaders,
  type CspOptions,
} from "./csp";

const base: CspOptions = {
  nonce: "bm9uY2Utbm9uY2Utbm9uY2U=",
  pathname: "/",
  dev: false,
  https: true,
  origin: "https://alfa.example",
};

/** directive name → its sources, for one serialized policy. */
function parse(policy: string): Map<string, string[]> {
  return new Map(
    policy.split("; ").map((part) => {
      const [name, ...sources] = part.split(" ");
      return [name!, sources];
    })
  );
}

describe("createNonce", () => {
  it("is 128 bits of base64 that Next's own extractor accepts", () => {
    const nonce = createNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(getScriptNonceFromHeader(`script-src 'nonce-${nonce}'`)).toBe(nonce);
  });

  it("is different every time", () => {
    const seen = new Set(Array.from({ length: 200 }, createNonce));
    expect(seen.size).toBe(200);
  });
});

describe("the nonce policy in report-only mode (the default)", () => {
  const csp = nonceCsp(base, false);
  const policy = parse(csp.value);

  it("is sent report-only", () => {
    expect(csp.header).toBe("Content-Security-Policy-Report-Only");
  });

  it("restricts scripts to the nonce and what nonced scripts load", () => {
    expect(policy.get("default-src")).toEqual(["'self'"]);
    expect(policy.get("script-src")).toEqual([
      "'self'",
      `'nonce-${base.nonce}'`,
      "'strict-dynamic'",
    ]);
  });

  it("carries a nonce Next can find", () => {
    expect(getScriptNonceFromHeader(csp.value)).toBe(base.nonce);
  });

  it("leaves out what browsers ignore in report-only headers", () => {
    expect(policy.has("frame-ancestors")).toBe(false);
    expect(policy.has("upgrade-insecure-requests")).toBe(false);
  });

  it("names the report endpoint both ways", () => {
    expect(policy.get("report-uri")).toEqual([
      "https://alfa.example/api/csp-report",
    ]);
    expect(policy.get("report-to")).toEqual(["csp-endpoint"]);
  });

  it("allows exactly the Cloudinary hosts the app uses, and no font CDN", () => {
    expect(policy.get("img-src")).toEqual([
      "'self'",
      "data:",
      "blob:",
      CSP_ORIGINS.cloudinaryDelivery,
    ]);
    expect(policy.get("connect-src")).toEqual([
      "'self'",
      CSP_ORIGINS.cloudinaryUpload,
    ]);
    expect(policy.get("font-src")).toEqual(["'self'"]);
    expect(policy.get("frame-src")).toEqual(["'none'"]);
  });

  it("lets the admin frame only its own pages (the print sheets)", () => {
    const admin = parse(
      nonceCsp({ ...base, pathname: "/admin/reservations" }, false).value
    );
    expect(admin.get("frame-src")).toEqual(["'self'"]);
  });
});

describe("the nonce policy when enforcing", () => {
  it("is one self-sufficient enforced header including the baseline", () => {
    const csp = nonceCsp({ ...base, pathname: "/admin" }, true);
    expect(csp.header).toBe("Content-Security-Policy");
    const policy = parse(csp.value);
    expect(policy.get("script-src")).toContain(`'nonce-${base.nonce}'`);
    expect(policy.get("frame-ancestors")).toEqual(["'none'"]);
    expect(policy.get("object-src")).toEqual(["'none'"]);
    expect(policy.has("upgrade-insecure-requests")).toBe(true);
  });
});

describe("per environment", () => {
  it("allows eval and unnonced <style> only in development", () => {
    const dev = parse(nonceCsp({ ...base, dev: true }, true).value);
    const prod = parse(nonceCsp(base, true).value);
    expect(dev.get("script-src")).toContain("'unsafe-eval'");
    expect(prod.get("script-src")).not.toContain("'unsafe-eval'");
    expect(dev.get("style-src-elem")).toContain("'unsafe-inline'");
    expect(prod.get("style-src-elem")).toEqual([
      "'self'",
      `'nonce-${base.nonce}'`,
    ]);
  });

  it("never upgrades requests on plain-http origins such as `next start` locally", () => {
    const local = parse(nonceCsp({ ...base, https: false }, true).value);
    expect(local.has("upgrade-insecure-requests")).toBe(false);
    for (const rule of staticSecurityHeaders(false)) {
      for (const { value } of rule.headers) {
        expect(value).not.toContain("upgrade-insecure-requests");
      }
    }
  });

  it("is off until CSP_ENFORCE is exactly 'true'", () => {
    expect(cspEnforced({})).toBe(false);
    expect(cspEnforced({ CSP_ENFORCE: "1" })).toBe(false);
    expect(cspEnforced({ CSP_ENFORCE: "true" })).toBe(true);
  });
});

describe("proxySecurityHeaders", () => {
  it("never sends an enforced CSP while reporting only", () => {
    // Next copies proxy response headers onto the request and reads the
    // enforced header first; a nonce-less one would hide the nonce.
    const headers = proxySecurityHeaders(base, false);
    expect(headers["Content-Security-Policy"]).toBeUndefined();
    expect(headers["Content-Security-Policy-Report-Only"]).toBeDefined();
  });

  it("falls back to report-uri alone on plain http, where report-to is never delivered", () => {
    const local = { ...base, origin: "http://localhost:3000" };
    const headers = proxySecurityHeaders(local, false);
    expect(headers["Reporting-Endpoints"]).toBeUndefined();
    const policy = parse(headers["Content-Security-Policy-Report-Only"]!);
    expect(policy.has("report-to")).toBe(false);
    expect(policy.get("report-uri")).toEqual([
      "http://localhost:3000/api/csp-report",
    ]);
  });

  it("points Reporting-Endpoints at this deployment", () => {
    expect(proxySecurityHeaders(base, true)["Reporting-Endpoints"]).toBe(
      'csp-endpoint="https://alfa.example/api/csp-report"'
    );
  });
});

describe("framing", () => {
  it.each([
    "/admin",
    "/admin/reservations",
    "/admin/printer",
    "/login",
    "/account/password",
  ])("denies framing %s", (pathname) =>
    expect(isFramingDenied(pathname)).toBe(true)
  );

  it("lets this origin alone frame the print sheets", () => {
    expect(framingFor("/admin/print/handover/abc")).toBe("self");
    expect(isFramingDenied("/admin/print/handover/abc")).toBe(false);
  });

  it.each(["/", "/car", "/car/x", "/booking", "/administrator", "/loginx"])(
    "lets the portfolio frame %s",
    (pathname) => expect(isFramingDenied(pathname)).toBe(false)
  );

  it("frames only from the portfolio on the storefront, from nowhere elsewhere", () => {
    const frame = (framing: "none" | "self" | "portfolio") =>
      baselineDirectives({ framing, https: true }).find(
        ([name]) => name === "frame-ancestors"
      );
    expect(frame("none")).toEqual(["frame-ancestors", "'none'"]);
    expect(frame("self")).toEqual(["frame-ancestors", "'self'"]);
    expect(frame("portfolio")).toEqual([
      "frame-ancestors",
      "'self'",
      CSP_ORIGINS.portfolio,
    ]);
  });
});

/**
 * Turns a next.config.ts `source` into a matcher close enough to Next's for
 * these patterns: `:path*` is any suffix, and the regex group is kept as is.
 */
function sourceMatches(source: string, pathname: string): boolean {
  const pattern = source
    .replace("/:path*", "(?:/.*)?")
    .replace(/:path\((.*)\)$/, "($1)");
  return new RegExp(`^${pattern}$`).test(pathname);
}

describe("staticSecurityHeaders (next.config.ts)", () => {
  const rules = staticSecurityHeaders(true);
  const headersFor = (pathname: string) =>
    rules
      .filter((rule) => sourceMatches(rule.source, pathname))
      .flatMap((rule) => rule.headers);

  it.each([
    "/admin",
    "/admin/vehicles/x/edit",
    "/login",
    "/account",
    "/account/password",
  ])("sends exactly one CSP, denying framing, plus DENY on %s", (pathname) => {
    const headers = headersFor(pathname);
    const csp = headers.filter((h) => h.key === "Content-Security-Policy");
    expect(csp).toHaveLength(1);
    expect(csp[0]!.value).toContain("frame-ancestors 'none'");
    expect(headers).toContainEqual({ key: "X-Frame-Options", value: "DENY" });
  });

  it.each([
    "/",
    "/car",
    "/car/some-slug",
    "/booking",
    "/privacy",
    "/administrator",
  ])(
    "sends exactly one CSP allowing the portfolio, and no X-Frame-Options, on %s",
    (pathname) => {
      const headers = headersFor(pathname);
      const csp = headers.filter((h) => h.key === "Content-Security-Policy");
      expect(csp).toHaveLength(1);
      expect(csp[0]!.value).toContain(
        `frame-ancestors 'self' ${CSP_ORIGINS.portfolio}`
      );
      // ALLOW-FROM is obsolete and SAMEORIGIN would break the embed.
      expect(headers.some((h) => h.key === "X-Frame-Options")).toBe(false);
    }
  );

  it.each([
    "/admin/print/handover/abc",
    "/admin/print/handover/abc?type=return",
  ])("lets only this origin frame the print sheet %s", (path) => {
    const headers = headersFor(path.split("?")[0]!);
    const csp = headers.filter((h) => h.key === "Content-Security-Policy");
    expect(csp).toHaveLength(1);
    expect(csp[0]!.value).toContain("frame-ancestors 'self'");
    expect(csp[0]!.value).not.toContain(CSP_ORIGINS.portfolio);
    expect(headers.filter((h) => h.key === "X-Frame-Options")).toEqual([
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
    ]);
  });

  it.each(["/admin/printer", "/admin/reservations/print"])(
    "still denies framing the look-alike %s",
    (pathname) => {
      const headers = headersFor(pathname);
      expect(headers).toContainEqual({ key: "X-Frame-Options", value: "DENY" });
      expect(
        headers.filter((h) => h.key === "Content-Security-Policy")
      ).toHaveLength(1);
    }
  );

  it("never carries a nonce or a script policy, which belong to the proxy", () => {
    for (const rule of rules) {
      for (const { value } of rule.headers) {
        expect(value).not.toMatch(/nonce|script-src|default-src/);
      }
    }
  });
});
