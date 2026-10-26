import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "./robots";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("robots.txt", () => {
  it("closes a Vercel preview entirely", () => {
    vi.stubEnv("SITE_INDEXING", "");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });

  it("keeps staff, API and sign-in out of production crawls", () => {
    vi.stubEnv("SITE_INDEXING", "");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("SITE_URL", "https://alfarent.example");
    expect(robots()).toEqual({
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/login"],
      },
      sitemap: "https://alfarent.example/sitemap.xml",
    });
  });
});
