import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site-url";
import { getPublicVehicleSitemap } from "@/services/vehicle.service";

/**
 * Rendered per request like the storefront itself, so the build never needs
 * the database and a newly added car is listed straight away.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const vehicles = await getPublicVehicleSitemap();
  const latest = vehicles[0]?.updatedAt ?? new Date();

  return [
    {
      url: absoluteUrl("/"),
      lastModified: latest,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: absoluteUrl("/car"),
      lastModified: latest,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: absoluteUrl("/contact"),
      changeFrequency: "yearly",
      priority: 0.5,
    },
    ...vehicles.map((vehicle) => ({
      url: absoluteUrl(`/car/${vehicle.slug}`),
      lastModified: vehicle.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
