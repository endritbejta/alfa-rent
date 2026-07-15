import type { ReservationStatus, VehicleStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

type Status = VehicleStatus | ReservationStatus;

/**
 * Lifecycle hues from the design system: brand red never encodes state,
 * and Reserved/Confirmed (blue) is distinct from Rented/Active (violet)
 * so tables can be scanned without reading labels. The dot carries the
 * color; the label carries it for color-blind users.
 */
const HUES: Record<Status, string> = {
  AVAILABLE: "text-status-available bg-status-available/12",
  RENTED: "text-status-rented bg-status-rented/12",
  SERVICE: "text-status-maint bg-status-maint/14",
  INACTIVE: "text-status-inactive bg-status-inactive/15",
  PENDING: "text-status-maint bg-status-maint/14",
  CONFIRMED: "text-status-reserved bg-status-reserved/12",
  ACTIVE: "text-status-rented bg-status-rented/12",
  COMPLETED: "text-status-inactive bg-status-inactive/15",
  CANCELLED: "text-destructive bg-destructive/10",
};

const LABELS: Partial<Record<Status, string>> = {
  SERVICE: "Maintenance",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
        HUES[status]
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {LABELS[status] ?? status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}
