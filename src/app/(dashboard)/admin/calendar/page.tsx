import { format } from "date-fns";
import { enUS, sq } from "date-fns/locale";
import { requireUser } from "@/lib/auth/guards";
import { getCalendarReservations } from "@/services/reservation.service";
import { getUpcomingSchedule } from "@/services/analytics.service";
import { PageHeader } from "@/components/dashboard/page-header";
import { Panel } from "@/components/dashboard/panel";
import { ScheduleList } from "@/components/dashboard/schedule-list";
import { CalendarTimeline } from "./calendar-timeline";
import { vehicleIdentifier } from "@/lib/vehicle-label";
import { calendarBar, calendarWindow } from "@/lib/calendar-window";
import { getI18n } from "@/lib/i18n/server";
import type { TranslationKey } from "@/lib/i18n/translations";

export const dynamic = "force-dynamic";

const LEGEND: { status: TranslationKey; className: string }[] = [
  { status: "vehicle.pending", className: "bg-status-maint/85" },
  { status: "vehicle.confirmed", className: "bg-status-reserved/90" },
  { status: "vehicle.active", className: "bg-status-rented/90" },
];

/** Noon UTC of a `yyyy-MM` month: formats as that month in any timezone. */
const monthDate = (key: string) => new Date(`${key}-01T12:00:00.000Z`);

export default async function CalendarPage() {
  await requireUser();
  const { locale, t } = await getI18n();
  const dateLocale = locale === "sq" ? sq : enUS;

  const now = new Date();
  // Anchored on today, so today is always on screen whatever the data holds.
  const range = calendarWindow(now);

  const [vehicles, schedule] = await Promise.all([
    getCalendarReservations(range.start, range.end, now),
    // The side panels want the week's handovers, not the dashboard's
    // thirteen-query snapshot.
    getUpcomingSchedule(),
  ]);

  const dayDates = range.days;
  const dayLabels = range.days.map((day) => String(Number(day.slice(8))));
  const months = range.months.map((m) => ({
    ...m,
    label: format(monthDate(m.key), "MMMM yyyy", { locale: dateLocale }),
  }));
  const firstMonth = range.months[0].key;
  const lastMonth = range.months[range.months.length - 1].key;

  const rows = vehicles.map((vehicle) => ({
    id: vehicle.id,
    name: `${vehicle.brand} ${vehicle.model}`,
    sub: vehicleIdentifier(vehicle),
    reservations: vehicle.reservations.flatMap((r) => {
      const bar = calendarBar(r, range);
      if (!bar) return [];
      return [
        {
          id: r.id,
          customerName: `${r.customer.firstName} ${r.customer.lastName}`,
          start: bar.start,
          span: bar.span,
          status: r.status as "PENDING" | "CONFIRMED" | "ACTIVE",
        },
      ];
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
          from: format(monthDate(firstMonth), "MMM yyyy", {
            locale: dateLocale,
          }),
          to: format(monthDate(lastMonth), "MMM yyyy", { locale: dateLocale }),
        })}
      />

      <div className="text-muted-foreground flex flex-wrap gap-4 text-xs">
        {LEGEND.map(({ status, className }) => (
          <span key={status} className="flex items-center gap-1.5">
            <span
              className={`inline-block h-3 w-3 rounded-none ${className}`}
            />
            {t(status)}
          </span>
        ))}
      </div>

      <CalendarTimeline
        dayLabels={dayLabels}
        dayDates={dayDates}
        months={months}
        todayIndex={range.todayIndex}
        rows={rows}
        vehicleOptions={vehicleOptions}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Panel
          title={t("admin.pickupSchedule")}
          subtitle={t("admin.nextSevenDays")}
        >
          <ScheduleList items={schedule.upcomingPickups} kind="pickup" />
        </Panel>
        <Panel
          title={t("admin.returnSchedule")}
          subtitle={t("admin.nextSevenDays")}
        >
          <ScheduleList items={schedule.upcomingReturns} kind="return" />
        </Panel>
      </div>
    </div>
  );
}
