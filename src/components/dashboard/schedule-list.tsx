"use client";

import { format } from "date-fns";
import { enUS, sq } from "date-fns/locale";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { vehicleLabel } from "@/lib/vehicle-label";
import { useDetailDrawer } from "@/components/dashboard/detail-drawer-context";
import { useI18n } from "@/components/shared/locale-provider";

type ScheduleItem = {
  id: string;
  pickupDate: Date;
  returnDate: Date;
  vehicle: { brand: string; model: string; plate?: string | null };
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
  const { openReservation } = useDetailDrawer();
  const { locale, t } = useI18n();
  const dateLocale = locale === "sq" ? sq : enUS;
  if (items.length === 0) {
    return (
      <EmptyState
        title={
          kind === "pickup"
            ? t("admin.noUpcomingPickups")
            : t("admin.noUpcomingReturns")
        }
        hint={t("admin.nothingNextSevenDays")}
      />
    );
  }
  const Icon = kind === "pickup" ? ArrowUpRight : ArrowDownLeft;
  return (
    <ul className="divide-y">
      {items.map((item) => {
        const date = kind === "pickup" ? item.pickupDate : item.returnDate;
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => openReservation(item.id)}
              className="hover:bg-surface-hover flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors"
            >
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
                  {vehicleLabel(item.vehicle)}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {item.customer.firstName} {item.customer.lastName}
                </p>
              </div>
              <p className="text-xs font-semibold tabular-nums">
                {format(date, "EEE dd MMM", { locale: dateLocale })}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
