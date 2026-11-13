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

export function StatusBadge({
  status,
  variant = "surface",
  dot = false,
}: {
  status: Status;
  variant?: "surface" | "overlay";
  /** A small square in the status colour before the label, for tables. */
  dot?: boolean;
}) {
  const { t } = useI18n();
  // "Available" is the default state; only exceptions are worth flagging.
  if (status === "AVAILABLE") return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap",
        variant === "overlay"
          ? "text-white"
          : SURFACE_HUES[status].split(" ")[0]
      )}
    >
      {dot && <span aria-hidden className="size-1.5 shrink-0 bg-current" />}
      {t(STATUS_KEYS[status])}
    </span>
  );
}
