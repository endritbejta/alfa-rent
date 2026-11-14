"use client";

import { format } from "date-fns";
import { enUS, sq } from "date-fns/locale";
import { ArrowRight } from "lucide-react";
import type { ReservationDetail } from "./detail-actions";
import { useI18n } from "@/components/shared/locale-provider";
import { lateReturnSummary } from "@/lib/late-return";
import { earlyReturnSummary } from "@/lib/early-return";
import { rentalDays } from "@/lib/rental-dates";
import { cn } from "@/lib/utils";

type Tone = "default" | "attention" | "late" | "void";

const TONE: Record<Tone, string> = {
  default: "text-foreground",
  attention: "text-status-maint",
  late: "text-destructive",
  void: "text-muted-foreground line-through",
};

/**
 * The rental period as one line — pickup → length → return — instead of a
 * column of five dated rows. The ends say what the booking is doing now:
 * the end due today turns amber, an overdue one red; a completed rental's
 * return end is the day the car actually came back, with the booked day
 * under it when they differ; a cancelled booking's dates are struck through.
 *
 * The length is the inclusive rental-day count (14 → 14 Nov is one day), and
 * after an early return it reads as days used of days booked.
 */
export function ReservationTimeline({ detail }: { detail: ReservationDetail }) {
  const { locale, t } = useI18n();
  const dateLocale = locale === "sq" ? sq : enUS;
  const date = (d: Date) => format(d, "d MMM yyyy", { locale: dateLocale });
  const weekday = (d: Date) => format(d, "EEEE", { locale: dateLocale });
  const days = (count: number) =>
    t(count === 1 ? "admin.dayCount" : "admin.dayCountPlural", { count });

  const { status, timing } = detail;
  const late = lateReturnSummary(detail);
  const early = earlyReturnSummary(detail);
  const bookedDays = rentalDays(detail.pickupDate, detail.returnDate);
  const cancelled = status === "CANCELLED";
  const completed = detail.completedAt !== null;
  // The return end shows the real return once there is one.
  const returnedOn = detail.completedAt ?? detail.returnDate;
  const movedReturn =
    completed && date(detail.completedAt!) !== date(detail.returnDate);

  const pickupTone: Tone = cancelled
    ? "void"
    : timing.attention === "PICKUP_OVERDUE"
      ? "late"
      : timing.attention === "PICKUP_TODAY"
        ? "attention"
        : "default";
  const returnTone: Tone = cancelled
    ? "void"
    : timing.attention === "RETURN_OVERDUE" || late
      ? "late"
      : timing.attention === "RETURN_TODAY"
        ? "attention"
        : "default";

  const length =
    early && early.usedDays !== bookedDays
      ? t("admin.daysOfBooked", { count: early.usedDays, booked: bookedDays })
      : days(bookedDays);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-x-3">
      <End
        label={t("admin.pickup")}
        value={date(detail.pickupDate)}
        sub={weekday(detail.pickupDate)}
        tone={pickupTone}
      />
      {/* The length sits on the arrow between the two ends. */}
      <div className="text-muted-foreground flex flex-col items-center pt-4">
        <span
          className={cn(
            "text-foreground text-xs font-medium whitespace-nowrap tabular-nums",
            cancelled && "text-muted-foreground"
          )}
        >
          {length}
        </span>
        <ArrowRight className="mt-0.5 size-4" aria-hidden />
        {late && (
          <span className="text-destructive text-[11px] font-medium whitespace-nowrap tabular-nums">
            +{days(late.days)}
          </span>
        )}
      </div>
      <End
        align="end"
        label={completed ? t("admin.actualReturn") : t("admin.return")}
        value={date(returnedOn)}
        sub={
          movedReturn
            ? `${t("admin.scheduledReturn")}: ${date(detail.returnDate)}`
            : weekday(returnedOn)
        }
        tone={returnTone}
      />
    </div>
  );
}

function End({
  label,
  value,
  sub,
  tone,
  align = "start",
}: {
  label: string;
  value: string;
  sub: string;
  tone: Tone;
  align?: "start" | "end";
}) {
  return (
    <div className={cn("min-w-0", align === "end" && "text-right")}>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={cn(
          "font-display mt-0.5 text-base font-semibold tabular-nums",
          TONE[tone]
        )}
      >
        {value}
      </p>
      <p className="text-muted-foreground mt-0.5 text-xs first-letter:uppercase">
        {sub}
      </p>
    </div>
  );
}
