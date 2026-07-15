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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const BAR_STYLES: Record<string, string> = {
  PENDING: "bg-status-maint/80 text-white",
  CONFIRMED: "bg-status-reserved/85 text-white",
  ACTIVE: "bg-status-rented/85 text-white",
};

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
        {Object.entries(BAR_STYLES).map(([status, style]) => (
          <span key={status} className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-3 rounded ${style}`} />
            {status.charAt(0) + status.slice(1).toLowerCase()}
          </span>
        ))}
      </div>

      <div className="bg-card overflow-x-auto rounded-xl border shadow-xs">
        <div className={view === "week" ? "min-w-[640px]" : "min-w-[900px]"}>
          <div
            className="text-muted-foreground grid border-b text-xs"
            style={{
              gridTemplateColumns: `9rem repeat(${days}, minmax(0, 1fr))`,
            }}
          >
            <div className="border-r p-2 font-medium">Vehicle</div>
            {Array.from({ length: days }, (_, i) => {
              const day = addDays(rangeStart, i);
              return (
                <div
                  key={i}
                  className={cn(
                    "border-r p-1 text-center last:border-r-0",
                    todayIndex === i &&
                      "bg-accent text-accent-foreground font-bold"
                  )}
                >
                  {view === "week" ? format(day, "EEE dd") : format(day, "d")}
                </div>
              );
            })}
          </div>

          {vehicles.map((vehicle) => (
            <div
              key={vehicle.id}
              className="grid items-center border-b last:border-b-0"
              style={{
                gridTemplateColumns: `9rem repeat(${days}, minmax(0, 1fr))`,
              }}
            >
              <div className="truncate border-r p-2 text-sm font-medium">
                {vehicle.brand} {vehicle.model}
              </div>
              <div
                className="relative col-span-full h-9"
                style={{ gridColumn: `2 / span ${days}` }}
              >
                {todayIndex !== null && (
                  <span
                    className="bg-brand/30 absolute inset-y-0 w-px"
                    style={{ left: `${((todayIndex + 0.5) / days) * 100}%` }}
                  />
                )}
                {vehicle.reservations.map((r) => {
                  const from = max([r.pickupDate, rangeStart]);
                  const to = min([r.returnDate, rangeEnd]);
                  const startDay = differenceInCalendarDays(from, rangeStart);
                  const span = Math.max(
                    1,
                    differenceInCalendarDays(to, from) +
                      (to === r.returnDate ? 0 : 1)
                  );
                  return (
                    <div
                      key={r.id}
                      title={`${r.customer.firstName} ${r.customer.lastName}: ${format(r.pickupDate, "dd MMM")} - ${format(r.returnDate, "dd MMM")} (${r.status})`}
                      className={`absolute top-1.5 h-6 truncate rounded px-1.5 text-xs leading-6 ${BAR_STYLES[r.status] ?? "bg-neutral-300"}`}
                      style={{
                        left: `${(startDay / days) * 100}%`,
                        width: `${(span / days) * 100}%`,
                      }}
                    >
                      {r.customer.firstName} {r.customer.lastName}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

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
