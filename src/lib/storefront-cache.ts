import { updateTag } from "next/cache";

/**
 * The tag on every cached storefront read (the fleet list, a car's page, the
 * brand list). Those reads include which cars are free for the searched
 * dates, so they go stale on a vehicle edit and on every reservation change
 * that takes days on a car or gives them back: confirm, cancel, extend, a
 * staff booking, a handover, a return.
 */
export const PUBLIC_VEHICLES_TAG = "public-vehicles";

/**
 * Expire the storefront's cached fleet so the next visitor reads the
 * database. Without it a car confirmed a moment ago was still offered as free
 * by the date-filtered list until the 60-second cache life ran out (audit
 * P3-6). The exclusion constraint stopped the double booking; the customer
 * just learned about it one form later.
 *
 * updateTag, not revalidateTag: this Next version reserves updateTag for
 * server actions and makes the next request wait for fresh data, where
 * revalidateTag(tag, "max") would keep serving the stale list while it
 * refreshes in the background. Call it after the write has committed, never
 * inside a $transaction: a visitor could otherwise refill the cache from the
 * old rows before the commit lands. A route handler cannot call it at all.
 */
export function refreshStorefront(): void {
  updateTag(PUBLIC_VEHICLES_TAG);
}
