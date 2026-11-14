/**
 * The storefront booking form's bot check: a honeypot field and a minimum
 * fill time (audit finding P2-1b). No vendor, no keys, no third-party
 * script, and nothing a person has to solve.
 *
 * - `website` is a field no person sees or reaches: hidden from sight and
 *   from screen readers, out of the tab order, autofill off. A script that
 *   fills every input it finds fills this one too.
 * - `formMs` is how long the page had been open when the form was sent (the
 *   submit event's timeStamp, so never less than the form was). Choosing two
 *   dates and typing four contact fields takes a person well over three
 *   seconds, even with autofill; a script posting on page load takes none.
 *
 * Both fields are optional, so the public JSON API keeps working for a caller
 * that has no form. This stops form-filling bots, not a script written
 * against the API, which can simply leave them out; the per-IP limit and
 * the request caps are what bound that one.
 */

export const HONEYPOT_FIELD = "website";
export const FILL_TIME_FIELD = "formMs";

/** Faster than any person completes the form. */
export const MIN_FILL_MS = 3_000;

export type BotVerdict = "human" | "honeypot" | "too-fast";

export function botVerdict(body: unknown): BotVerdict {
  if (typeof body !== "object" || body === null) return "human";
  const record = body as Record<string, unknown>;

  const honeypot = record[HONEYPOT_FIELD];
  if (honeypot !== undefined && honeypot !== null && honeypot !== "") {
    return "honeypot";
  }

  const elapsed = record[FILL_TIME_FIELD];
  if (elapsed === undefined || elapsed === null) return "human";
  // Sent but not a sensible duration: only a client that is not our form
  // gets this wrong.
  if (typeof elapsed !== "number" || !Number.isFinite(elapsed)) {
    return "too-fast";
  }
  return elapsed < MIN_FILL_MS ? "too-fast" : "human";
}
