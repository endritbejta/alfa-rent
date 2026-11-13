"use client";

import type { LateReturnSummary } from "@/lib/late-return";
import { formatEur } from "@/lib/money";
import { useI18n } from "@/components/shared/locale-provider";

/**
 * "3 days late" beside a completed rental's status, with what was done about
 * it: the amount charged, or that it was waived (the reason on hover; the
 * drawer shows it in full). Sits with ReservationAttention, which stops
 * flagging a rental the moment it is completed — this is the record that
 * remains.
 */
export function LateReturnNote({ late }: { late: LateReturnSummary | null }) {
  const { locale, t } = useI18n();
  if (!late) return null;
  const days = t(late.days === 1 ? "admin.lateChip" : "admin.lateChipPlural", {
    count: late.days,
  });
  const outcome =
    late.resolution === "CHARGED"
      ? `+${formatEur(late.charge, locale)}`
      : t("admin.lateWaivedChip");

  return (
    <span
      className="text-status-maint inline-flex text-xs font-medium whitespace-nowrap"
      title={late.waiverReason ?? undefined}
    >
      {days} · {outcome}
    </span>
  );
}
