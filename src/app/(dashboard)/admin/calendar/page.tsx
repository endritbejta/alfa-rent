import Link from "next/link";
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  max,
  min,
  parse,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { requireUser } from "@/lib/auth/guards";
import { getCalendarReservations } from "@/services/reservation.service";
import { getDashboardData } from "@/services/analytics.service";
import { PageHeader } from "@/components/dashboard/page-header";
import { Panel } from "@/components/dashboard/panel";
import { ScheduleList } from "@/components/dashboard/schedule-list";
import { CalendarTimeline } from "@/components/dashboard/calendar-timeline";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const LEGEND: { status: string; className: string }[] = [
  { status: "Pending", className: "bg-status-maint/85" },
  { status: "Confirmed", className: "bg-status-reserved/90" },
  { status: "Active", className: "bg-status-rented/90" },
];

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; view?: string }>;
}) {
  await requireUser();
  const { month, view: viewParam } = await searchParams;
  const view = viewParam === "week" ? "week" : "month";

  const parsed = month
    ? parse(month, view === "week" ? "yyyy-MM-dd" : "yyyy-MM", new Date())
    : new Date();
  const base = isValid(parsed) ? parsed : new Date();

  const rangeStart =
    view === "week"
      ? startOfWeek(base, { weekStartsOn: 1 })
      : startOfMonth(base);
  const rangeEnd =
    view === "week" ? endOfWeek(base, { weekStartsOn: 1 }) : endOfMonth(base);
  const days = differenceInCalendarDays(rangeEnd, rangeStart) + 1;

  const nav = (delta: number) => {
    const target =
      view === "week" ? addWeeks(base, delta) : addMonths(base, delta);
    return `/admin/calendar?view=${view}&month=${format(target, view === "week" ? "yyyy-MM-dd" : "yyyy-MM")}`;
  };

  const [vehicles, dashboard] = await Promise.all([
    getCalendarReservations(rangeStart, rangeEnd),
    getDashboardData(),
  ]);

  const today = new Date();
  const todayIndex =
    today >= rangeStart && today <= rangeEnd
      ? differenceInCalendarDays(today, rangeStart)
      : null;

  // Flatten to plain data for the interactive client grid.
  const dayLabels = Array.from({ length: days }, (_, i) =>
    format(addDays(rangeStart, i), view === "week" ? "EEE dd" : "d")
  );
  const dayDates = Array.from({ length: days }, (_, i) =>
    format(addDays(rangeStart, i), "yyyy-MM-dd")
  );
  const timelineRows = vehicles.map((vehicle) => ({
    id: vehicle.id,
    name: `${vehicle.brand} ${vehicle.model}`,
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
    name: `${v.brand} ${v.model}`,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        description={
          view === "week"
            ? `Week of ${format(rangeStart, "dd MMM")} - ${format(rangeEnd, "dd MMM yyyy")}`
            : format(base, "MMMM yyyy")
        }
      >
        <div className="bg-secondary inline-flex rounded-full border p-0.5">
          {(["month", "week"] as const).map((v) => (
            <Link
              key={v}
              href={`/admin/calendar?view=${v}`}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
                view === v
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {v}
            </Link>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={nav(-1)} />}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={nav(1)} />}
        >
          Next
        </Button>
      </PageHeader>

      <div className="text-muted-foreground flex flex-wrap gap-4 text-xs">
        {LEGEND.map(({ status, className }) => (
          <span key={status} className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-3 rounded ${className}`} />
            {status}
          </span>
        ))}
      </div>

      <CalendarTimeline
        view={view}
        days={days}
        dayLabels={dayLabels}
        dayDates={dayDates}
        todayIndex={todayIndex}
        rows={timelineRows}
        vehicleOptions={vehicleOptions}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Pickup schedule" subtitle="Next 7 days">
          <ScheduleList items={dashboard.upcomingPickups} kind="pickup" />
        </Panel>
        <Panel title="Return schedule" subtitle="Next 7 days">
          <ScheduleList items={dashboard.upcomingReturns} kind="return" />
        </Panel>
      </div>
    </div>
  );
}
