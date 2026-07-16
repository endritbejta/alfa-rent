"use client";

import { format } from "date-fns";
import { useDetailDrawer } from "@/app/(dashboard)/admin/reservation-detail";
import { vehicleLabel } from "@/utils/vehicle";

type Item = {
  id: string;
  brand: string;
  model: string;
  plate: string | null;
  year: number;
  createdAt: Date;
};

/**
 * Dashboard-style widget: opens the vehicle drawer so the operator can
 * review without losing the fleet page they were reading.
 */
export function RecentlyAdded({ items }: { items: Item[] }) {
  const { openVehicle } = useDetailDrawer();

  return (
    <ul className="divide-y">
      {items.map((v) => (
        <li key={v.id}>
          <button
            type="button"
            onClick={() => openVehicle(v.id)}
            className="hover:bg-secondary flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left text-sm transition-colors"
          >
            <span className="truncate font-medium">{vehicleLabel(v)}</span>
            <span className="text-muted-foreground shrink-0 text-xs">
              {format(v.createdAt, "dd MMM yyyy")}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
