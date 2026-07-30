"use client";

import { useState, useTransition } from "react";
import { differenceInCalendarDays, format } from "date-fns";
import { CalendarPlus, Info } from "lucide-react";
import type { ExtensionWindow } from "@/services/reservation.service";
import { extendReservationAction } from "./actions";
import {
  DatePicker,
  toDateValue,
  toLocalDay,
} from "@/components/forms/date-range-picker";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/shared/locale-provider";
import { enUS, sq } from "date-fns/locale";

const addDays = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/**
 * Extend a rental in place.
 *
 * The ceiling comes down with the reservation, so the picker only offers
 * dates that can actually succeed and the added cost is shown before the
 * operator commits — the common case ("they're keeping it two more days")
 * is one click, a date, and a confirm.
 */
export function ExtendReservation({
  reservationId,
  returnDate,
  pricePerDay,
  extension,
  onExtended,
}: {
  reservationId: string;
  returnDate: Date;
  pricePerDay: number;
  extension: ExtensionWindow;
  onExtended: () => void;
}) {
  const { locale, t } = useI18n();
  const dateLocale = locale === "sq" ? sq : enUS;
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<Date | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!extension.allowed) {
    return (
      <p className="text-muted-foreground mt-3 flex items-start gap-1.5 text-xs">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        {extension.reason === "Confirm this request before extending it."
          ? t("admin.confirmBeforeExtend")
          : extension.reason ===
              "The vehicle is booked again immediately after this rental."
            ? t("admin.bookedImmediately")
            : extension.reason ===
                "The vehicle's registration expires at the end of this rental."
              ? t("admin.registrationEnds")
              : t("admin.cannotExtend")}
      </p>
    );
  }

  const currentDay = toLocalDay(returnDate);
  const minDate = addDays(currentDay, 1);
  const maxDate = extension.latestReturn
    ? toLocalDay(extension.latestReturn)
    : undefined;

  // Time of day is preserved by the service, so calendar days gained is
  // exactly what gets billed.
  const extraDays = value ? differenceInCalendarDays(value, currentDay) : 0;
  const addedPrice = extraDays * pricePerDay;
  const valid = extraDays > 0 && (!maxDate || value! <= maxDate);

  const reset = () => {
    setOpen(false);
    setValue(undefined);
    setError(null);
  };

  const submit = () => {
    if (!value) return;
    setError(null);
    startTransition(async () => {
      const result = await extendReservationAction(
        reservationId,
        toDateValue(value)
      );
      if (result?.error) {
        setError(result.error);
        return;
      }
      reset();
      onExtended();
    });
  };

  if (!open) {
    return (
      <div className="mt-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setOpen(true)}
        >
          <CalendarPlus className="h-4 w-4" />
          {t("admin.extendRental")}
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-secondary/60 mt-3 space-y-3 rounded-lg border p-3">
      <div>
        <label
          htmlFor="extend-return"
          className="text-muted-foreground mb-1.5 block text-[11px] font-semibold tracking-[0.06em] uppercase"
        >
          {t("admin.newReturnDate")}
        </label>
        <DatePicker
          id="extend-return"
          value={value}
          onChange={(date) => {
            setValue(date);
            setError(null);
          }}
          minDate={minDate}
          maxDate={maxDate}
          placeholder={t("admin.chooseReturnDate")}
        />
        <p className="text-muted-foreground mt-1.5 text-xs">
          {extension.latestReturn ? (
            <>
              {t("admin.availableUntil", {
                date: format(extension.latestReturn, "dd MMM yyyy", {
                  locale: dateLocale,
                }),
              })}{" "}
              —{" "}
              {extension.limitedBy === "booking"
                ? t("admin.bookedAfter")
                : t("admin.registrationExpires")}
            </>
          ) : (
            t("admin.noLaterBooking")
          )}
        </p>
      </div>

      {extraDays > 0 && (
        <dl className="space-y-1 text-xs">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t("admin.added")}</dt>
            <dd className="font-semibold tabular-nums">
              {t(extraDays === 1 ? "admin.dayCount" : "admin.dayCountPlural", {
                count: extraDays,
              })}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">
              {t("admin.ratePerDay", { rate: pricePerDay.toFixed(2) })}
            </dt>
            <dd className="font-display font-bold tabular-nums">
              +{addedPrice.toFixed(2)} EUR
            </dd>
          </div>
        </dl>
      )}

      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={reset}
        >
          {t("common.cancel")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="success"
          disabled={!valid || pending}
          onClick={submit}
        >
          {pending
            ? t("admin.extending")
            : value && extraDays > 0
              ? t("admin.extendTo", {
                  date: format(value, "dd MMM", { locale: dateLocale }),
                })
              : t("admin.extend")}
        </Button>
      </div>
    </div>
  );
}
