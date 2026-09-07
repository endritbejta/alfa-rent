"use client";

import type { ReservationStatus, VehicleStatus } from "@prisma/client";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/shared/locale-provider";
import { STATUS_KEYS } from "@/lib/status-labels";

type Status = VehicleStatus | ReservationStatus;

/**
 * Lifecycle hues from the design system: brand red never encodes state,
 * and Reserved/Confirmed (blue) is distinct from Rented/Active (violet)
 * so tables can be scanned without reading labels. The dot carries the
 * color; the label carries it for color-blind users.
 */
const SURFACE_HUES: Record<Status, string> = {
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

const DOT_HUES: Record<Status, string> = {
  AVAILABLE: "bg-status-available",
  RENTED: "bg-status-rented",
  SERVICE: "bg-status-maint",
  INACTIVE: "bg-status-inactive",
  PENDING: "bg-status-maint",
  CONFIRMED: "bg-status-reserved",
  ACTIVE: "bg-status-rented",
  COMPLETED: "bg-status-inactive",
  CANCELLED: "bg-destructive",
};

export function StatusBadge({
  status,
  variant = "surface",
}: {
  status: Status;
  variant?: "surface" | "overlay";
}) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
        variant === "overlay"
          ? "bg-media/95 border-white/25 text-white shadow-md backdrop-blur-sm"
          : cn("border-current/15", SURFACE_HUES[status])
      )}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          variant === "overlay" ? DOT_HUES[status] : "bg-current"
        )}
      />
      {t(STATUS_KEYS[status])}
    </span>
  );
}
