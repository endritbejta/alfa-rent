"use client";

import { format } from "date-fns";
import { enUS, sq } from "date-fns/locale";
import { History } from "lucide-react";
import type { AuditValue } from "@/lib/audit";
import type { AuditHistoryItem } from "@/services/audit.service";
import type { TranslationKey } from "@/lib/i18n/translations";
import { businessWallClock } from "@/lib/business-time";
import { useI18n } from "@/components/shared/locale-provider";
import { SectionTitle } from "./detail-primitives";
import { formatEur } from "@/lib/money";

/** Field names an edit event may carry, in the words the forms use. */
const FIELD_LABELS: Record<string, TranslationKey> = {
  firstName: "booking.firstName",
  lastName: "booking.lastName",
  email: "admin.email",
  phone: "admin.phone",
  notes: "admin.notes",
  status: "admin.status",
  brand: "admin.brand",
  model: "admin.model",
  plate: "admin.plate",
  year: "admin.year",
  seats: "admin.seats",
  description: "admin.description",
  pricePerDay: "admin.pricePerDay",
  returnDate: "admin.returnDate",
};

/** Edits whose changed fields are worth listing, old value to new. */
const SHOWS_FIELDS = new Set(["customer.update", "vehicle.update"]);

/**
 * Who did what to this record, when, and why: the audit trail (P2-7),
 * newest first. Times are the branch's, whatever this browser's zone.
 */
export function AuditHistory({ items }: { items: AuditHistoryItem[] }) {
  const { locale, t } = useI18n();
  const dateLocale = locale === "sq" ? sq : enUS;

  /** A rental date is a calendar value stored as UTC midnight-ish. */
  const calendarDay = (value: AuditValue | AuditValue[] | undefined) => {
    if (typeof value !== "string") return "—";
    const d = new Date(value);
    return format(
      new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
      "dd MMM yyyy",
      { locale: dateLocale }
    );
  };

  const describe = (item: AuditHistoryItem) => {
    const key = `audit.${item.action}` as const;
    if (item.action === "reservation.extend") {
      return t(key, { date: calendarDay(item.after?.returnDate) });
    }
    if (
      item.action === "reservation.lateCharge" ||
      item.action === "reservation.lateWaive"
    ) {
      const count =
        typeof item.after?.lateDays === "number" ? item.after.lateDays : 0;
      const charge = item.after?.lateCharge;
      const charged = item.action === "reservation.lateCharge";
      const pluralKey = charged
        ? "audit.reservation.lateChargePlural"
        : "audit.reservation.lateWaivePlural";
      return t(count === 1 ? key : pluralKey, {
        count,
        amount:
          typeof charge === "string" || typeof charge === "number"
            ? formatEur(charge, locale)
            : "—",
      });
    }
    if (item.action === "customer.merge") {
      const merged = item.after?.mergedIds;
      return t(key, { count: Array.isArray(merged) ? merged.length : 0 });
    }
    return t(key);
  };

  const actor = (item: AuditHistoryItem) =>
    item.actor.kind === "staff"
      ? item.actor.name
      : item.actor.kind === "system"
        ? t("admin.historySystem")
        : t("admin.historyRemovedStaff");

  const show = (value: AuditValue | AuditValue[] | undefined) =>
    value === null || value === undefined || value === "" ? "—" : String(value);

  return (
    <section>
      <SectionTitle icon={History}>{t("admin.history")}</SectionTitle>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          {t("admin.historyEmpty")}
        </p>
      ) : (
        <ol className="divide-y">
          {items.map((item) => {
            const fields = SHOWS_FIELDS.has(item.action)
              ? Object.keys(item.after ?? {})
              : [];
            return (
              <li key={item.id} className="space-y-1 py-2.5 text-xs">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <p className="font-semibold">{describe(item)}</p>
                  <time
                    dateTime={new Date(item.createdAt).toISOString()}
                    className="text-muted-foreground tabular-nums"
                  >
                    {format(
                      businessWallClock(new Date(item.createdAt)),
                      "dd MMM yyyy, HH:mm",
                      { locale: dateLocale }
                    )}
                  </time>
                </div>
                <p className="text-muted-foreground">{actor(item)}</p>
                {item.reason && (
                  <p className="bg-secondary rounded-none p-2 break-words whitespace-pre-line">
                    {item.reason}
                  </p>
                )}
                {fields.length > 0 && (
                  <dl className="space-y-0.5">
                    {fields.map((field) => (
                      <div key={field} className="flex min-w-0 gap-1.5">
                        <dt className="text-muted-foreground shrink-0">
                          {FIELD_LABELS[field] ? t(FIELD_LABELS[field]) : field}
                          :
                        </dt>
                        <dd className="min-w-0 truncate">
                          {show(item.before?.[field])} →{" "}
                          {show(item.after?.[field])}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
