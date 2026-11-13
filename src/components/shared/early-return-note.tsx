"use client";

import type { EarlyReturnSummary } from "@/lib/early-return";
import { formatEur } from "@/lib/money";
import { useI18n } from "@/components/shared/locale-provider";

/**
 * "early · 1 day billed" beside a completed rental's status: the record that
 * it came back before its return day, and how staff billed it. The booked
 * amount it was billed against is on hover; the drawer shows it in full.
 * The counterpart of LateReturnNote.
 */
export function EarlyReturnNote({
  early,
}: {
  early: EarlyReturnSummary | null;
}) {
  const { locale, t } = useI18n();
  if (!early) return null;
  const label =
    early.billing === "ACTUAL_DAYS"
      ? t(
          early.usedDays === 1
            ? "admin.earlyChipActual"
            : "admin.earlyChipActualPlural",
          { count: early.usedDays }
        )
      : t("admin.earlyChipFull");

  return (
    <span
      className="text-muted-foreground inline-flex text-xs font-medium whitespace-nowrap"
      title={`${t("admin.originalAmount")}: ${formatEur(early.bookedTotal, locale)}`}
    >
      {label}
    </span>
  );
}
