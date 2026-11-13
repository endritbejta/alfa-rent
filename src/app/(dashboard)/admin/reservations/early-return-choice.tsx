"use client";

import { useI18n } from "@/components/shared/locale-provider";
import { cn } from "@/lib/utils";
import {
  actualRentalDays,
  earlyReturnAmounts,
  earlyReturnDays,
  type EarlyReturnBilling,
} from "@/lib/early-return";
import { formatEur } from "@/lib/money";
import { formatDay } from "./format-day";

export type EarlyChoice = { billing: EarlyReturnBilling | null };

export const NO_EARLY_CHOICE: EarlyChoice = { billing: null };

/**
 * What is missing before an early return can be saved, or null when
 * nothing is. A return on or after the booked day needs nothing here.
 */
export function earlyChoiceProblem(
  pickupDay: string,
  returnDay: string,
  returnedOn: string,
  choice: EarlyChoice
): { key: "admin.earlyChooseRequired" } | null {
  if (earlyReturnDays(pickupDay, returnDay, returnedOn) === null) return null;
  return choice.billing ? null : { key: "admin.earlyChooseRequired" };
}

/**
 * A return before the booked return day: staff choose how it is billed
 * before the rental can close — the days used at the booking's agreed rate,
 * or the full booking. Nothing is preselected: the choice changes what the
 * customer pays, so it is made, not defaulted into.
 *
 * Laid out as the settlement it is: who and what, the three dates, the
 * booking against the days used, the two options with their amounts, and
 * the final amount, which follows the selection. The figures are for
 * reading only; the service computes them itself in Decimal and refuses a
 * day count that differs from the one shown.
 *
 * Renders nothing unless the return is early, and posts through plain named
 * fields so either dialog's form carries it.
 */
export function EarlyReturnChoice({
  idPrefix,
  pickupDay,
  returnDay,
  returnedOn,
  dailyRate,
  bookedTotal,
  customerName,
  vehicleName,
  choice,
  onChange,
}: {
  idPrefix: string;
  /** Booked pickup and return days and the actual return, `yyyy-MM-dd`. */
  pickupDay: string;
  returnDay: string;
  returnedOn: string;
  /** The rate the booking was agreed at. */
  dailyRate: number;
  /** The booking's total as it stands. */
  bookedTotal: number;
  customerName: string;
  vehicleName: string;
  choice: EarlyChoice;
  onChange: (choice: EarlyChoice) => void;
}) {
  const { locale, t } = useI18n();
  const usedDays = earlyReturnDays(pickupDay, returnDay, returnedOn);
  if (usedDays === null) return null;

  const bookedDays = actualRentalDays(pickupDay, returnDay);
  const amounts = earlyReturnAmounts({ dailyRate, usedDays, bookedTotal });
  const eur = (value: number) => formatEur(value, locale);
  const days = (count: number) =>
    t(count === 1 ? "admin.dayCount" : "admin.dayCountPlural", { count });
  // Bookings made before rentals counted both ends were priced for one day
  // fewer than they now span. Said, rather than left as a sum that does not
  // add up.
  const pricedDays = dailyRate > 0 ? bookedTotal / dailyRate : bookedDays;
  const pricedDifferently =
    Number.isInteger(Math.round(pricedDays * 100) / 100) &&
    Math.round(pricedDays) !== bookedDays;
  const capped =
    amounts.ACTUAL_DAYS < Math.round(dailyRate * usedDays * 100) / 100;
  const final = choice.billing ? amounts[choice.billing] : null;

  const facts: [string, React.ReactNode][] = [
    [t("admin.customer"), customerName],
    [t("admin.vehicle"), vehicleName],
    [t("admin.pickup"), formatDay(pickupDay)],
    [t("admin.scheduledReturn"), formatDay(returnDay)],
    [
      t("admin.actualReturn"),
      <span key="actual" className="text-foreground font-semibold">
        {formatDay(returnedOn)}
      </span>,
    ],
    [
      t("admin.bookedDuration"),
      <span key="booked">
        {days(bookedDays)}
        {pricedDifferently && (
          <span className="text-muted-foreground block text-[11px] font-normal">
            {t("admin.pricedForDays", { count: Math.round(pricedDays) })}
          </span>
        )}
      </span>,
    ],
    [t("admin.daysUsed"), days(usedDays)],
    [
      t("admin.agreedRate"),
      <span key="rate" title={t("admin.agreedRateHelp")}>
        {eur(dailyRate)}
      </span>,
    ],
    [t("admin.bookedAmount"), eur(bookedTotal)],
  ];

  const options: {
    billing: EarlyReturnBilling;
    label: string;
    detail: string;
  }[] = [
    {
      billing: "ACTUAL_DAYS",
      label: t("admin.earlyBillActual"),
      detail: capped
        ? t("admin.earlyBillActualCapped")
        : t("admin.earlyBillActualSum", {
            days: days(usedDays),
            rate: eur(dailyRate),
          }),
    },
    {
      billing: "FULL_BOOKING",
      label: t("admin.earlyBillFull"),
      detail: t("admin.earlyBillFullSum"),
    },
  ];

  return (
    <fieldset
      className="border-brand/40 space-y-4 rounded-none border-l-2 pl-4"
      aria-describedby={`${idPrefix}-early-help`}
    >
      <legend className="text-sm font-semibold">
        {t("admin.earlyReturnTitle", { count: usedDays, booked: bookedDays })}
      </legend>
      <p
        id={`${idPrefix}-early-help`}
        className="text-muted-foreground -mt-2 text-xs"
      >
        {t("admin.earlyReturnHelp", { date: formatDay(returnDay) })}
      </p>

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 border-y py-3 text-xs">
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {choice.billing && (
        <input type="hidden" name="earlyBilling" value={choice.billing} />
      )}
      {choice.billing === "ACTUAL_DAYS" && (
        <input type="hidden" name="earlyDays" value={usedDays} />
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <label
            key={option.billing}
            className={cn(
              "hover:bg-surface-hover grid cursor-pointer grid-cols-[auto_1fr] items-start gap-x-2 gap-y-1 border p-3 transition-colors",
              "has-[:focus-visible]:ring-ring/40 has-[:focus-visible]:ring-2",
              "has-[:checked]:border-brand has-[:checked]:bg-brand/5"
            )}
          >
            <input
              type="radio"
              name={`${idPrefix}-early-choice`}
              checked={choice.billing === option.billing}
              onChange={() => onChange({ billing: option.billing })}
              className="accent-brand mt-0.5 h-4 w-4"
            />
            <span className="text-sm leading-snug font-semibold">
              {option.label}
            </span>
            <span className="col-start-2 flex items-baseline justify-between gap-2">
              <span className="text-muted-foreground text-xs">
                {option.detail}
              </span>
              <span className="font-display text-base font-bold whitespace-nowrap tabular-nums">
                {eur(amounts[option.billing])}
              </span>
            </span>
          </label>
        ))}
      </div>

      <div
        className="flex items-baseline justify-between border-t pt-3"
        aria-live="polite"
      >
        <span className="text-muted-foreground text-xs font-semibold tracking-[0.08em] uppercase">
          {t("admin.finalAmount")}
        </span>
        <span className="font-display text-xl font-bold whitespace-nowrap tabular-nums">
          {final === null ? "—" : eur(final)}
        </span>
      </div>
    </fieldset>
  );
}
