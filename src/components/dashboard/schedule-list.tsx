import { format } from "date-fns";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";

type ScheduleItem = {
  id: string;
  pickupDate: Date;
  returnDate: Date;
  vehicle: { brand: string; model: string };
  customer: { firstName: string; lastName: string };
};

/** Upcoming pickups or returns as a compact schedule. */
export function ScheduleList({
  items,
  kind,
}: {
  items: ScheduleItem[];
  kind: "pickup" | "return";
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title={
          kind === "pickup" ? "No upcoming pickups" : "No upcoming returns"
        }
        hint="Nothing scheduled in the next 7 days."
      />
    );
  }
  const Icon = kind === "pickup" ? ArrowUpRight : ArrowDownLeft;
  return (
    <ul className="divide-y">
      {items.map((item) => {
        const date = kind === "pickup" ? item.pickupDate : item.returnDate;
        return (
          <li key={item.id} className="flex items-center gap-3 py-2.5">
            <span
              className={
                kind === "pickup"
                  ? "bg-status-reserved/12 text-status-reserved flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  : "bg-status-rented/12 text-status-rented flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              }
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {item.vehicle.brand} {item.vehicle.model}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {item.customer.firstName} {item.customer.lastName}
              </p>
            </div>
            <p className="text-xs font-semibold tabular-nums">
              {format(date, "EEE dd MMM")}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
