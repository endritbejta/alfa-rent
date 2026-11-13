/**
 * Bounds of the reason staff must give to cancel a reservation (audit P2-7).
 * Its own module so the cancel dialog can read them without pulling the
 * server-side validation or audit code into the browser bundle.
 */
export const CANCEL_REASON_MIN = 10;
export const CANCEL_REASON_MAX = 500;
