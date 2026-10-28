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
}: {
  status: Status;
  variant?: "surface" | "overlay";
}) {
  const { t } = useI18n();
  // "Available" is the default state; only exceptions are worth flagging.
  if (status === "AVAILABLE") return null;
  return (
    <span
      className={cn(
        "inline-flex items-center text-xs font-medium",
        variant === "overlay"
          ? "text-white"
          : SURFACE_HUES[status].split(" ")[0]
      )}
    >
      {t(STATUS_KEYS[status])}
    </span>
  );
}
