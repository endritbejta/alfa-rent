import Link from "next/link";
import {
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  getDaysInMonth,
  isValid,
  max,
  min,
  parse,
  startOfMonth,
} from "date-fns";
import { requireUser } from "@/lib/auth/guards";
import { getCalendarReservations } from "@/services/reservation.service";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const BAR_STYLES: Record<string, string> = {
  PENDING: "bg-amber-400/80 text-amber-950",
  CONFIRMED: "bg-blue-500/80 text-white",
  ACTIVE: "bg-emerald-500/80 text-white",
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireUser();
  const { month } = await searchParams;

  const parsed = month ? parse(month, "yyyy-MM", new Date()) : new Date();
  const base = isValid(parsed) ? parsed : new Date();
  const monthStart = startOfMonth(base);
  const monthEnd = endOfMonth(base);
  const days = getDaysInMonth(base);

  const vehicles = await getCalendarReservations(monthStart, monthEnd);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Calendar</h1>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <Link
                href={`/admin/calendar?month=${format(addMonths(base, -1), "yyyy-MM")}`}
              />
            }
          >
            Previous
          </Button>
          <span className="min-w-32 text-center font-medium">
            {format(base, "MMMM yyyy")}
          </span>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <Link
                href={`/admin/calendar?month=${format(addMonths(base, 1), "yyyy-MM")}`}
              />
            }
          >
            Next
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs">
        {Object.entries(BAR_STYLES).map(([status, style]) => (
          <span key={status} className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-3 rounded ${style}`} />
            {status}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <div className="min-w-[900px]">
          <div
            className="grid border-b text-xs text-neutral-500"
            style={{
              gridTemplateColumns: `10rem repeat(${days}, minmax(0, 1fr))`,
            }}
          >
            <div className="border-r p-2 font-medium">Vehicle</div>
            {Array.from({ length: days }, (_, i) => (
              <div key={i} className="border-r p-1 text-center last:border-r-0">
                {i + 1}
              </div>
            ))}
          </div>

          {vehicles.map((vehicle) => (
            <div
              key={vehicle.id}
              className="grid items-center border-b last:border-b-0"
              style={{
                gridTemplateColumns: `10rem repeat(${days}, minmax(0, 1fr))`,
              }}
            >
              <div className="truncate border-r p-2 text-sm font-medium">
                {vehicle.brand} {vehicle.model}
              </div>
              <div
                className="relative col-span-full h-9"
                style={{ gridColumn: `2 / span ${days}` }}
              >
                {vehicle.reservations.map((r) => {
                  const from = max([r.pickupDate, monthStart]);
                  const to = min([r.returnDate, monthEnd]);
                  const startDay = differenceInCalendarDays(from, monthStart);
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
    </div>
  );
}
