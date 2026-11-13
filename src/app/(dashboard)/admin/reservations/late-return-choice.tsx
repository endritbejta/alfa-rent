"use client";

import { TriangleAlert } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/components/shared/locale-provider";
import {
  LATE_WAIVER_REASON_MAX,
  LATE_WAIVER_REASON_MIN,
  lateReturnDays,
} from "@/lib/late-return";
import { formatEur } from "@/lib/money";
import { formatDay } from "./format-day";

export type LateChoice = {
  resolution: "CHARGE" | "WAIVE" | null;
  reason: string;
};

export const NO_LATE_CHOICE: LateChoice = { resolution: null, reason: "" };

/**
 * What is missing before a return can be saved, as a translation key and
 * its values, or null when nothing is. An on-time return needs nothing.
 */
export function lateChoiceProblem(
  returnDay: string,
  returnedOn: string,
  choice: LateChoice
):
  | { key: "admin.lateChooseRequired" }
  | { key: "admin.lateReasonTooShort"; min: number }
  | null {
  if (!returnedOn || lateReturnDays(returnDay, returnedOn) === 0) return null;
  if (!choice.resolution) return { key: "admin.lateChooseRequired" };
  if (
    choice.resolution === "WAIVE" &&
    choice.reason.trim().length < LATE_WAIVER_REASON_MIN
  ) {
    return { key: "admin.lateReasonTooShort", min: LATE_WAIVER_REASON_MIN };
  }
  return null;
}

/**
 * A return after the booked return day (audit P2-4): staff charge the extra
 * days or waive them with a reason before the rental can close.
 *
 * Shows N and the price before anything is confirmed. The figures here are
 * for reading only: the service computes N and the charge itself, in
 * Decimal, and refuses a CHARGE whose N differs from the one shown.
 *
 * Renders nothing for an on-time return, and posts its choice through
 * plain named fields so either dialog's form carries it.
 */
export function LateReturnChoice({
  idPrefix,
  returnDay,
  returnedOn,
  pricePerDay,
  totalPrice,
  choice,
  onChange,
}: {
  idPrefix: string;
  /** The booked return day, `yyyy-MM-dd`. */
  returnDay: string;
  /** The day the car actually came back, `yyyy-MM-dd`. */
  returnedOn: string;
  /** The car's rate today, which is what extra days are charged at. */
  pricePerDay: number;
  totalPrice: number;
  choice: LateChoice;
  onChange: (choice: LateChoice) => void;
}) {
  const { locale, t } = useI18n();
  const days = returnedOn ? lateReturnDays(returnDay, returnedOn) : 0;
  if (days === 0) return null;

  const eur = (value: number) => formatEur(value, locale);
  // Display only; cents rounded so 3 × 33.33 does not print 99.99000000001.
  const charge = Math.round(pricePerDay * days * 100) / 100;
  const plural = days !== 1;
  const option =
    "flex cursor-pointer items-start gap-2 border p-3 text-sm has-[:checked]:border-brand";

  return (
    <fieldset
      className="border-destructive/40 bg-destructive/5 space-y-3 rounded-none border p-3"
      aria-describedby={`${idPrefix}-late-help`}
    >
      <legend className="sr-only">
        {t(plural ? "admin.returnedLatePlural" : "admin.returnedLate", {
          count: days,
        })}
      </legend>
      <p
        aria-hidden
        className="text-destructive flex items-center gap-2 text-sm font-semibold"
      >
        <TriangleAlert className="h-4 w-4 shrink-0" />
        {t(plural ? "admin.returnedLatePlural" : "admin.returnedLate", {
          count: days,
        })}
      </p>
      <p id={`${idPrefix}-late-help`} className="text-muted-foreground text-xs">
        {t("admin.lateReturnHelp", { date: formatDay(returnDay) })}
      </p>

      {choice.resolution && (
        <input type="hidden" name="lateResolution" value={choice.resolution} />
      )}
      {choice.resolution === "CHARGE" && (
        <input type="hidden" name="lateDays" value={days} />
      )}

      <label className={option}>
        <input
          type="radio"
          name={`${idPrefix}-late-choice`}
          checked={choice.resolution === "CHARGE"}
          onChange={() => onChange({ ...choice, resolution: "CHARGE" })}
          className="accent-brand mt-0.5 h-4 w-4 shrink-0"
        />
        <span className="font-semibold">
          {t(plural ? "admin.lateChargePlural" : "admin.lateCharge", {
            count: days,
          })}
          <span className="text-muted-foreground block text-xs font-normal tabular-nums">
            {t("admin.lateChargeSum", {
              rate: eur(pricePerDay),
              count: days,
              amount: eur(charge),
              total: eur(Math.round((totalPrice + charge) * 100) / 100),
            })}
          </span>
        </span>
      </label>

      <label className={option}>
        <input
          type="radio"
          name={`${idPrefix}-late-choice`}
          checked={choice.resolution === "WAIVE"}
          onChange={() => onChange({ ...choice, resolution: "WAIVE" })}
          className="accent-brand mt-0.5 h-4 w-4 shrink-0"
        />
        <span className="font-semibold">{t("admin.lateWaive")}</span>
      </label>

      {choice.resolution === "WAIVE" && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-late-reason`}>
            {t("admin.lateWaiverReason")}
          </Label>
          <Textarea
            id={`${idPrefix}-late-reason`}
            name="lateWaiverReason"
            required
            minLength={LATE_WAIVER_REASON_MIN}
            maxLength={LATE_WAIVER_REASON_MAX}
            value={choice.reason}
            onChange={(event) =>
              onChange({ ...choice, reason: event.target.value })
            }
            placeholder={t("admin.lateWaiverPlaceholder")}
          />
        </div>
      )}
    </fieldset>
  );
}
