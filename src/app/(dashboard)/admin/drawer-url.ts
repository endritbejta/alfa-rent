/**
 * The detail drawer's state, written into the URL.
 *
 * Reservations and customers have no route of their own — both exist only as
 * drawer state — so before this there was no way to bookmark a booking, send
 * a colleague a link to one, or get back to it after a refresh, and Back left
 * the page instead of closing the panel. For a tool where two people discuss
 * the same booking over the phone, that is real friction.
 *
 * One param per kind, and only one drawer at a time; the param name is the
 * kind. Pure string work, so the provider stays about fetching.
 */
export const DRAWER_KINDS = ["reservation", "vehicle", "customer"] as const;

export type DrawerKind = (typeof DRAWER_KINDS)[number];
export type DrawerTarget = { kind: DrawerKind; id: string };

/** Accepts both URLSearchParams and Next's read-only flavour. */
type Readable = { get(name: string): string | null };

export function readDrawerTarget(params: Readable): DrawerTarget | null {
  for (const kind of DRAWER_KINDS) {
    const id = params.get(kind);
    if (id) return { kind, id };
  }
  return null;
}

/**
 * The query string with this record open, and any other drawer closed —
 * every other param (filters, page, sort) is left exactly as it was, because
 * closing the drawer has to put the operator back on the list they were
 * reading.
 */
export function withDrawerTarget(search: string, target: DrawerTarget): string {
  const params = clear(search);
  params.set(target.kind, target.id);
  return params.toString();
}

export function withoutDrawerTarget(search: string): string {
  return clear(search).toString();
}

function clear(search: string): URLSearchParams {
  const params = new URLSearchParams(search);
  for (const kind of DRAWER_KINDS) params.delete(kind);
  return params;
}
