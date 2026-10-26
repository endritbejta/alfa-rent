import type { MetadataRoute } from "next";
import { absoluteUrl, siteIsIndexable } from "@/lib/site-url";

/**
 * The storefront is public; the staff panel, the API and sign-in are not.
 * The booking form is deliberately crawlable but carries `noindex`: a
 * robots.txt block would hide that tag, and Google can still list a blocked
 * URL that other pages link to. Preview deployments are closed entirely.
 */
export default function robots(): MetadataRoute.Robots {
  if (!siteIsIndexable()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/", "/login"],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
