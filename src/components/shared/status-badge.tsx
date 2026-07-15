import { Badge } from "@/components/ui/badge";
import type { ReservationStatus, VehicleStatus } from "@prisma/client";

const STYLES: Record<VehicleStatus | ReservationStatus, string> = {
  AVAILABLE: "bg-emerald-100 text-emerald-800",
  RENTED: "bg-blue-100 text-blue-800",
  SERVICE: "bg-amber-100 text-amber-800",
  INACTIVE: "bg-neutral-200 text-neutral-600",
  PENDING: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-blue-100 text-blue-800",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  COMPLETED: "bg-neutral-200 text-neutral-600",
  CANCELLED: "bg-red-100 text-red-700",
};

export function StatusBadge({
  status,
}: {
  status: VehicleStatus | ReservationStatus;
}) {
  return (
    <Badge variant="secondary" className={STYLES[status]}>
      {status}
    </Badge>
  );
}
