import { format } from "date-fns";

/** A `YYYY-MM-DD` calendar day for display; noon keeps it on its own day. */
export function formatDay(day: string): string {
  return format(new Date(`${day}T12:00:00`), "dd MMM yyyy");
}
