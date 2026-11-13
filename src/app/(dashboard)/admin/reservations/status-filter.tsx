import Link from "next/link";
import { ReservationStatus } from "@prisma/client";
import { cn } from "@/lib/utils";
import { getI18n } from "@/lib/i18n/server";
import { RESERVATION_STATUS_KEYS as STATUS_KEYS } from "@/lib/status-labels";
import type { TranslationKey } from "@/lib/i18n/translations";

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
/**
 * The tabs whose count can mean "staff must act", and how to say why. The
 * rule is the header's own "overdue" figure split by status, plus the
 * pending requests that still await a decision:
 *
 * - Pending: requests whose pickup day has not passed (expired ones wait on
 *   no one, see `isExpiredRequest`).
 * - Confirmed: pickup day has passed and no handover was recorded.
 * - Active: return day has passed and no return was recorded.
 *
 * Completed and Cancelled are history; All would only repeat the others.
 */
const URGENT_LABELS = {
  PENDING: "admin.urgentPending",
  CONFIRMED: "admin.urgentPickups",
  ACTIVE: "admin.urgentReturns",
} as const satisfies Partial<Record<ReservationStatus, TranslationKey>>;

export async function StatusFilter({
  counts,
  pendingActionable,
  urgent,
  active,
}: {
  counts: Partial<Record<ReservationStatus, number>>;
  /**
   * Shown on the Pending tab instead of the raw PENDING count, so it agrees
   * with the badge: expired requests are listed there but wait on no one.
   */
  pendingActionable: number;
  /** How many of each status need staff action now; see URGENT_LABELS. */
  urgent: Partial<Record<keyof typeof URGENT_LABELS, number>>;
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
      urgentNote: null,
    },
    ...STATUSES.map((s) => {
      const urgentCount =
        s in URGENT_LABELS ? (urgent[s as keyof typeof URGENT_LABELS] ?? 0) : 0;
      return {
        key: s,
        text: t(STATUS_KEYS[s]),
        count: s === "PENDING" ? pendingActionable : (counts[s] ?? 0),
        href: `/admin/reservations?status=${s}`,
        urgentNote:
          urgentCount > 0
            ? t(URGENT_LABELS[s as keyof typeof URGENT_LABELS], {
                count: urgentCount,
              })
            : null,
      };
    }),
  ];

  return (
    // Narrow screens scroll the control rather than wrapping it into a
    // second row that would reintroduce the bulk this replaces.
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div
        role="group"
        aria-label={t("admin.filterStatus")}
        className="inline-flex w-max border-b"
      >
        {options.map((option) => {
          const selected = active === option.key;
          const urgent = option.urgentNote !== null;

          return (
            <Link
              key={option.text}
              href={option.href}
              aria-current={selected ? "page" : undefined}
              title={option.urgentNote ?? undefined}
              className={cn(
                "flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors",
                selected
                  ? "border-foreground text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {option.text}
              {/* Red is not the only signal: a square marks the count for
                  anyone who can't tell the colours apart, and the reason is
                  read out with the tab's name. */}
              <span
                className={cn(
                  "flex items-center gap-1 tabular-nums",
                  urgent
                    ? "text-destructive font-bold"
                    : "text-muted-foreground"
                )}
              >
                {urgent && (
                  <span aria-hidden className="bg-destructive h-1.5 w-1.5" />
                )}
                {option.count}
              </span>
              {urgent && <span className="sr-only">, {option.urgentNote}</span>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
