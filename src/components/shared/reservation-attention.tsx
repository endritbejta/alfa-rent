import type { ReservationTiming } from "@/lib/reservation-lifecycle";
import { cn } from "@/lib/utils";

const LABELS: Record<NonNullable<ReservationTiming["attention"]>, string> = {
  PICKUP_TODAY: "Pickup today",
  PICKUP_OVERDUE: "Pickup overdue",
  RETURN_TODAY: "Return today",
  RETURN_OVERDUE: "Return overdue",
};

export function ReservationAttention({
  attention,
}: {
  attention: ReservationTiming["attention"];
}) {
  if (!attention) return null;
  const overdue = attention.endsWith("OVERDUE");

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-1 text-[11px] font-semibold whitespace-nowrap",
        overdue
          ? "bg-destructive/10 text-destructive"
          : "bg-status-maint/14 text-status-maint"
      )}
    >
      {LABELS[attention]}
    </span>
  );
}
