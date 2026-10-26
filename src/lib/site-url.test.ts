import { afterEach, describe, expect, it, vi } from "vitest";
import { absoluteUrl, siteIsIndexable, siteUrl } from "./site-url";
import { cloudinaryJpegCrop } from "@/lib/cloudinary/image-loader";

afterEach(() => {
  vi.unstubAllEnvs();
});

function clearSiteEnv() {
  vi.stubEnv("SITE_URL", "");
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
  vi.stubEnv("AUTH_URL", "");
  vi.stubEnv("SITE_INDEXING", "");
}

describe("siteUrl", () => {
  it("prefers an explicit SITE_URL", () => {
    clearSiteEnv();
    vi.stubEnv("SITE_URL", "https://alfarent.example");
    vi.stubEnv("AUTH_URL", "https://other.example");
    expect(absoluteUrl("/car")).toBe("https://alfarent.example/car");
  });

  /** A preview deployment must still point canonicals at production. */
  it("uses Vercel's production domain before AUTH_URL", () => {
    clearSiteEnv();
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "alfarent.example");
    vi.stubEnv("AUTH_URL", "https://preview-123.vercel.app");
    expect(siteUrl().origin).toBe("https://alfarent.example");
  });

  it("skips a malformed value and falls back to local development", () => {
    clearSiteEnv();
    vi.stubEnv("SITE_URL", "not a url");
    expect(siteUrl().origin).toBe("http://localhost:3000");
  });
});

describe("indexing", () => {
  it("indexes Vercel production and non-Vercel hosts", () => {
    clearSiteEnv();
    vi.stubEnv("VERCEL_ENV", "production");
    expect(siteIsIndexable()).toBe(true);
  });

  it("never indexes a Vercel preview", () => {
    clearSiteEnv();
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(siteIsIndexable()).toBe(false);
  });

  it("lets a self-hosted deployment opt out", () => {
    clearSiteEnv();
    vi.stubEnv("SITE_INDEXING", "false");
    expect(siteIsIndexable()).toBe(false);
  });
});

describe("cloudinaryJpegCrop", () => {
  it("crops a Cloudinary photo to a fixed JPEG", () => {
    expect(
      cloudinaryJpegCrop(
        "https://res.cloudinary.com/demo/image/upload/v1/cars/a.jpg",
        1200,
        630
      )
    ).toBe(
      "https://res.cloudinary.com/demo/image/upload/c_fill,g_auto,w_1200,h_630,q_auto,f_jpg/v1/cars/a.jpg"
    );
  });

  it("ignores anything that is not a Cloudinary upload", () => {
    expect(cloudinaryJpegCrop(undefined, 1200, 630)).toBeNull();
    expect(
      cloudinaryJpegCrop("/brand/alfa-logo-red.png", 1200, 630)
    ).toBeNull();
    expect(
      cloudinaryJpegCrop("https://evil.example/x.jpg", 1200, 630)
    ).toBeNull();
  });
});
