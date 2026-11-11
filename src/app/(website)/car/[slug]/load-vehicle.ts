import { notFound } from "next/navigation";
import { cache } from "react";
import { NotFoundError } from "@/lib/errors";
import { getPublicVehicleBySlug } from "@/services/vehicle.service";

/**
 * The car a `/car/[slug]` request is about, or the 404 page.
 *
 * Memoised per request, so the layout (which is what decides the status code),
 * `generateMetadata` and the page share a single read.
 */
export const loadVehicle = cache(async (slug: string) => {
  try {
    return await getPublicVehicleBySlug(slug);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
});
