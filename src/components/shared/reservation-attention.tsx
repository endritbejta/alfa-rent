"use client";

import type { ReservationTiming } from "@/lib/reservation-lifecycle";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/shared/locale-provider";
import type { TranslationKey } from "@/lib/i18n/translations";

const LABELS: Record<
  NonNullable<ReservationTiming["attention"]>,
  TranslationKey
> = {
  PICKUP_TODAY: "admin.pickupToday",
  PICKUP_OVERDUE: "admin.pickupOverdue",
  RETURN_TODAY: "admin.returnToday",
  RETURN_OVERDUE: "admin.returnOverdue",
};

export function ReservationAttention({
  attention,
}: {
  attention: ReservationTiming["attention"];
}) {
  const { t } = useI18n();
  if (!attention) return null;
  const overdue = attention.endsWith("OVERDUE");

  return (
    <span
      className={cn(
        "inline-flex text-xs font-medium whitespace-nowrap",
        overdue ? "text-destructive" : "text-status-maint"
      )}
    >
      {t(LABELS[attention])}
    </span>
  );
}
