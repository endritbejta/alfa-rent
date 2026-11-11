import { loadVehicle } from "./load-vehicle";

/**
 * Settles whether the car exists before the page's `loading.tsx` can stream.
 *
 * `loading.tsx` wraps page.tsx in Suspense, not this layout, and the status
 * code is fixed the moment that boundary sends its fallback. A `notFound()`
 * from the page always arrived too late: an unknown or retired car answered
 * 200 with a noindex tag, a soft 404 that search engines and uptime checks
 * read as a working page. Raised here, it is a real 404.
 *
 * One side effect, accepted deliberately: a notFound() thrown from a layout
 * gets Next's bare error document from the server, and the 404 page itself is
 * drawn in the browser once the scripts run, still inside the site layout.
 * Keeping the instant skeleton for every working car page outweighs a moment
 * of blank page on a dead link.
 *
 * This is the page's own memoised and cached read, so the page reuses it
 * instead of querying again, and the skeleton still covers the booking
 * calendar, which is the uncached part.
 */
export default async function VehicleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await loadVehicle(slug);
  return children;
}
