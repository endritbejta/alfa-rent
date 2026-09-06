/**
 * The list view, as it travels in the URL.
 *
 * Deliberately not in view-switcher.tsx: that file is `"use client"`, and a
 * server component calling one of its exports fails at request time with
 * "attempted to call readView() from the server". Neither tsc nor the build
 * catches it, because the pages that read this are force-dynamic and are only
 * evaluated when someone loads them.
 */
export const VIEWS = ["grid", "list", "compact"] as const;

export type View = (typeof VIEWS)[number];

/** Grid is the default, so it stays out of the URL. */
export const DEFAULT_VIEW: View = "grid";

export function readView(raw: string | undefined): View {
  return VIEWS.includes(raw as View) ? (raw as View) : DEFAULT_VIEW;
}
