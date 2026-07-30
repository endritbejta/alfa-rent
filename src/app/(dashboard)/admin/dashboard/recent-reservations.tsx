"use client";

import { format } from "date-fns";
import { enUS, sq } from "date-fns/locale";
import { useReservationDetail } from "@/app/(dashboard)/admin/reservation-detail";
import { StatusBadge } from "@/components/shared/status-badge";
import { vehicleLabel } from "@/utils/vehicle";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/components/shared/locale-provider";

type Item = {
  id: string;
  pickupDate: Date;
  returnDate: Date;
  totalPrice: string;
  status: "PENDING" | "CONFIRMED" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  vehicle: { brand: string; model: string; plate: string | null };
  customer: { firstName: string; lastName: string };
};

/** Recent reservations, each row opening the shared detail drawer. */
export function RecentReservations({ items }: { items: Item[] }) {
  const { openReservation } = useReservationDetail();
  const { locale, t } = useI18n();
  const dateLocale = locale === "sq" ? sq : enUS;

  return (
    <>
      <ul className="divide-y md:hidden">
        {items.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => openReservation(r.id)}
              className="hover:bg-surface-hover flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-3 text-left transition-colors"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {r.customer.firstName} {r.customer.lastName}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {vehicleLabel(r.vehicle)} -{" "}
                  {format(r.pickupDate, "dd MMM", { locale: dateLocale })}
                </p>
              </div>
              <StatusBadge status={r.status} />
            </button>
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin.customer")}</TableHead>
              <TableHead>{t("admin.vehicle")}</TableHead>
              <TableHead>{t("admin.dates")}</TableHead>
              <TableHead className="text-right">{t("admin.total")}</TableHead>
              <TableHead>{t("admin.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((r) => (
              <TableRow
                key={r.id}
                onClick={() => openReservation(r.id)}
                className="hover:bg-surface-hover cursor-pointer transition-colors"
              >
                <TableCell>
                  {r.customer.firstName} {r.customer.lastName}
                </TableCell>
                <TableCell>{vehicleLabel(r.vehicle)}</TableCell>
                <TableCell>
                  {format(r.pickupDate, "dd MMM", { locale: dateLocale })} -{" "}
                  {format(r.returnDate, "dd MMM", { locale: dateLocale })}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {Number(r.totalPrice).toFixed(2)} EUR
                </TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
