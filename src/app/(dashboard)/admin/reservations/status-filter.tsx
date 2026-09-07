import Link from "next/link";
import { ReservationStatus } from "@prisma/client";
import { cn } from "@/lib/utils";
import { getI18n } from "@/lib/i18n/server";
import { RESERVATION_STATUS_KEYS as STATUS_KEYS } from "@/lib/status-labels";

const STATUSES = Object.values(ReservationStatus);

/**
 * Status filter as a segmented control rather than six summary cards.
 *
 * The cards read as primary content — six bordered surfaces with 2xl numerals
 * outweighed the table they filter. These are controls, so they get control
 * weight: one pill, sitting in the panel's toolbar.
 *
 * Still plain links, so filtering stays a URL the operator can bookmark and
 * share, costs no client JS, and survives a reload.
 */
export async function StatusFilter({
  counts,
  active,
}: {
  counts: Partial<Record<ReservationStatus, number>>;
  active?: ReservationStatus;
}) {
  const { t } = await getI18n();
  const total = STATUSES.reduce((sum, s) => sum + (counts[s] ?? 0), 0);

  const options = [
    {
      key: undefined,
      text: t("common.all"),
      count: total,
      href: "/admin/reservations",
    },
    ...STATUSES.map((s) => ({
      key: s,
      text: t(STATUS_KEYS[s]),
      count: counts[s] ?? 0,
      href: `/admin/reservations?status=${s}`,
    })),
  ];

  return (
    // Narrow screens scroll the control rather than wrapping it into a
    // second row that would reintroduce the bulk this replaces.
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div
        role="group"
        aria-label={t("admin.filterStatus")}
        className="bg-secondary inline-flex w-max rounded-full border p-0.5"
      >
        {options.map((option) => {
          const selected = active === option.key;
          // Pending is the only count that means "someone is waiting on us",
          // so it keeps the brand accent the badge uses everywhere else.
          const urgent = option.key === "PENDING" && option.count > 0;

          return (
            <Link
              key={option.text}
              href={option.href}
              aria-current={selected ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors",
                selected
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {option.text}
              <span
                className={cn(
                  "tabular-nums",
                  urgent ? "text-brand" : "text-muted-foreground"
                )}
              >
                {option.count}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
