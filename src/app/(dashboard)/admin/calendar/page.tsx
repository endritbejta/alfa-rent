import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  getDaysInMonth,
  max,
  min,
  startOfMonth,
} from "date-fns";
import { enUS, sq } from "date-fns/locale";
import { requireUser } from "@/lib/auth/guards";
import {
  getCalendarReservations,
  getReservationDateBounds,
} from "@/services/reservation.service";
import { getDashboardData } from "@/services/analytics.service";
import { PageHeader } from "@/components/dashboard/page-header";
import { Panel } from "@/components/dashboard/panel";
import { ScheduleList } from "@/components/dashboard/schedule-list";
import { CalendarTimeline } from "./calendar-timeline";
import { vehicleIdentifier } from "@/utils/vehicle";
import { getI18n } from "@/lib/i18n/server";
import type { TranslationKey } from "@/lib/i18n/translations";

export const dynamic = "force-dynamic";

const LEGEND: { status: TranslationKey; className: string }[] = [
  { status: "vehicle.pending", className: "bg-status-maint/85" },
  { status: "vehicle.confirmed", className: "bg-status-reserved/90" },
  { status: "vehicle.active", className: "bg-status-rented/90" },
];

/** Hard cap so a stray far-future booking can't render a decade of columns. */
const MAX_MONTHS = 14;

export default async function CalendarPage() {
  await requireUser();
  const { locale, t } = await getI18n();
  const dateLocale = locale === "sq" ? sq : enUS;

  const today = new Date();
  const bounds = await getReservationDateBounds();

  // The strip spans every month that holds work, always including today.
  const rangeStart = startOfMonth(min([bounds.min ?? today, today]));
  let rangeEnd = endOfMonth(max([bounds.max ?? today, today]));
  if (rangeEnd > addMonths(rangeStart, MAX_MONTHS)) {
    rangeEnd = endOfMonth(addMonths(rangeStart, MAX_MONTHS));
  }

  const [vehicles, dashboard] = await Promise.all([
    getCalendarReservations(rangeStart, rangeEnd),
    getDashboardData(),
  ]);

  const days = differenceInCalendarDays(rangeEnd, rangeStart) + 1;
  const dayDates = Array.from({ length: days }, (_, i) =>
    format(addDays(rangeStart, i), "yyyy-MM-dd")
  );
  const dayLabels = Array.from({ length: days }, (_, i) =>
    format(addDays(rangeStart, i), "d")
  );

  const months = [];
  for (
    let cursor = rangeStart;
    cursor <= rangeEnd;
    cursor = addMonths(cursor, 1)
  ) {
    months.push({
      key: format(cursor, "yyyy-MM"),
      label: format(cursor, "MMMM yyyy", { locale: dateLocale }),
      start: differenceInCalendarDays(cursor, rangeStart),
      days: getDaysInMonth(cursor),
    });
  }

  const todayIndex =
    today >= rangeStart && today <= rangeEnd
      ? differenceInCalendarDays(today, rangeStart)
      : null;

  const rows = vehicles.map((vehicle) => ({
    id: vehicle.id,
    name: `${vehicle.brand} ${vehicle.model}`,
    sub: vehicleIdentifier(vehicle),
    reservations: vehicle.reservations.map((r) => {
      const from = max([r.pickupDate, rangeStart]);
      const to = min([r.returnDate, rangeEnd]);
      return {
        id: r.id,
        customerName: `${r.customer.firstName} ${r.customer.lastName}`,
        start: differenceInCalendarDays(from, rangeStart),
        span: Math.max(
          1,
          differenceInCalendarDays(to, from) + (to === r.returnDate ? 0 : 1)
        ),
        status: r.status as "PENDING" | "CONFIRMED" | "ACTIVE",
      };
    }),
  }));

  const vehicleOptions = vehicles.map((v) => ({
    id: v.id,
    name: `${v.brand} ${v.model}${v.plate ? ` · ${v.plate}` : ` (${v.year})`}`,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("admin.calendar")}
        description={t("admin.calendarDescription", {
          from: format(rangeStart, "MMM yyyy", { locale: dateLocale }),
          to: format(rangeEnd, "MMM yyyy", { locale: dateLocale }),
        })}
      />

      <div className="text-muted-foreground flex flex-wrap gap-4 text-xs">
        {LEGEND.map(({ status, className }) => (
          <span key={status} className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-3 rounded ${className}`} />
            {t(status)}
          </span>
        ))}
      </div>

      <CalendarTimeline
        dayLabels={dayLabels}
        dayDates={dayDates}
        months={months}
        todayIndex={todayIndex}
        rows={rows}
        vehicleOptions={vehicleOptions}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Panel
          title={t("admin.pickupSchedule")}
          subtitle={t("admin.nextSevenDays")}
        >
          <ScheduleList items={dashboard.upcomingPickups} kind="pickup" />
        </Panel>
        <Panel
          title={t("admin.returnSchedule")}
          subtitle={t("admin.nextSevenDays")}
        >
          <ScheduleList items={dashboard.upcomingReturns} kind="return" />
        </Panel>
      </div>
    </div>
  );
}
