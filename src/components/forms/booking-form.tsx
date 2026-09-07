"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { addDays } from "date-fns";
import {
  ArrowLeftRight,
  CalendarDays,
  CheckCircle2,
  Users,
} from "lucide-react";
import {
  DatePicker,
  fromDateValue,
  toDateValue,
} from "@/components/forms/date-range-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ApiResponse } from "@/types/api";
import { useI18n } from "@/components/shared/locale-provider";
import { PendingStatus } from "@/components/shared/pending-status";
import type { TranslationKey } from "@/lib/i18n/translations";
import {
  isBookingDayBlocked,
  isBookingRangeAvailable,
  type VehicleBookingCalendar,
} from "@/lib/booking-calendar";

const createFormSchema = (t: (key: TranslationKey) => string) =>
  z
    .object({
      vehicleId: z.string().min(1, t("booking.chooseError")),
      from: z.string().min(1, t("booking.pickupRequired")),
      to: z.string().min(1, t("booking.returnRequired")),
      firstName: z.string().trim().min(1, t("booking.required")).max(50),
      lastName: z.string().trim().min(1, t("booking.required")).max(50),
      email: z.email(t("booking.validEmail")),
      phone: z.string().trim().min(6, t("booking.validPhone")).max(25),
      notes: z.string().trim().max(1000).optional(),
    })
    .refine((data) => !data.from || !data.to || data.to > data.from, {
      message: t("booking.rangeError"),
      path: ["to"],
    });

type FormValues = z.infer<ReturnType<typeof createFormSchema>>;

type VehicleOption = {
  id: string;
  label: string;
  category: string;
  transmission: string;
  seats: number;
  pricePerDay: number;
  imageUrl?: string;
};

/** Generous: a slow phone connection submitting a booking is not a failure. */
const BOOKING_REQUEST_TIMEOUT_MS = 20_000;

type Confirmation = {
  id: string;
  totalPrice: number;
  /** Held in memory for the future hosted-checkout step; never persisted. */
  paymentAccessToken: string;
};

export function BookingForm({
  vehicle,
  initialFrom,
  initialTo,
  initialRangeAvailable,
  bookingCalendar,
  changeVehicleHref,
}: {
  vehicle: VehicleOption;
  initialFrom?: string;
  initialTo?: string;
  initialRangeAvailable: boolean;
  bookingCalendar: VehicleBookingCalendar;
  changeVehicleHref: string;
}) {
  const { t } = useI18n();
  const [serverError, setServerError] = useState<string | null>(
    initialFrom && initialTo && !initialRangeAvailable
      ? t("availability.booked")
      : null
  );
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const confirmationHeading = useRef<HTMLHeadingElement>(null);
  const now = new Date();
  const minDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const latestReturnDate = fromDateValue(
    bookingCalendar.latestReturnDate ?? undefined
  );
  const latestPickupDate = latestReturnDate
    ? addDays(latestReturnDate, -1)
    : undefined;

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(createFormSchema(t)),
    defaultValues: {
      vehicleId: vehicle.id,
      from: initialRangeAvailable ? (initialFrom ?? "") : "",
      to: initialRangeAvailable ? (initialTo ?? "") : "",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      notes: "",
    },
  });

  const pickedFrom = useWatch({ control, name: "from" });
  const pickedTo = useWatch({ control, name: "to" });

  const rentalDays =
    pickedFrom && pickedTo && pickedTo > pickedFrom
      ? Math.round(
          (Date.parse(`${pickedTo}T00:00:00Z`) -
            Date.parse(`${pickedFrom}T00:00:00Z`)) /
            86_400_000
        )
      : null;
  const estimatedTotal = rentalDays ? vehicle.pricePerDay * rentalDays : null;
  const unavailablePickup = (date: Date) =>
    isBookingDayBlocked(toDateValue(date), bookingCalendar.blockedRanges);
  const unavailableReturn = (date: Date) =>
    pickedFrom
      ? !isBookingRangeAvailable(pickedFrom, toDateValue(date), bookingCalendar)
      : false;

  /*
   * On success the form is replaced by the confirmation card. Scrolling to
   * the top is the sighted half of that; without moving focus, a screen
   * reader is given no signal at all — not that the booking succeeded, not
   * that a reference number exists, not that the form has gone. Combined
   * with a network failure being equally silent, success and failure
   * sounded identical.
   *
   * preventScroll, then scroll deliberately: focusing an element scrolls it
   * into view on its own, and the card is meant to start at the top.
   */
  useEffect(() => {
    if (!confirmation) return;
    confirmationHeading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [confirmation]);

  /**
   * Everything from the request onward is inside the try, including
   * response.json(): a proxy that answers a 502 with an HTML body fails there,
   * not at the fetch. Without this the promise rejects, react-hook-form clears
   * isSubmitting and rethrows, and React 19 does not route an event-handler
   * rejection to an error boundary — so the button would quietly return to
   * "Send" and the customer would be told nothing at all.
   */
  const onSubmit = async (data: FormValues) => {
    setServerError(null);
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        // Without this a stalled connection never settles, so the catch below
        // never runs and the form sits in "Sending…" indefinitely.
        signal: AbortSignal.timeout(BOOKING_REQUEST_TIMEOUT_MS),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleId: data.vehicleId,
          pickupDate: `${data.from}T10:00:00Z`,
          returnDate: `${data.to}T10:00:00Z`,
          customer: {
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            phone: data.phone,
          },
          notes: data.notes || undefined,
        }),
      });
      const json: ApiResponse<Confirmation> = await response.json();
      if (!json.success) {
        setServerError(json.error.message);
        return;
      }
      setConfirmation(json.data);
    } catch {
      setServerError(t("booking.sendError"));
    }
  };

  if (confirmation) {
    return (
      <div className="bg-card mx-auto max-w-2xl rounded-3xl p-8 text-center shadow-md motion-safe:animate-[modal-in_var(--motion-panel)_var(--ease-standard)]">
        <span className="bg-status-available/10 text-status-available mx-auto flex h-16 w-16 items-center justify-center rounded-full">
          <CheckCircle2 className="h-8 w-8" />
        </span>
        <h2
          ref={confirmationHeading}
          tabIndex={-1}
          className="font-display mt-5 text-2xl font-bold outline-none"
        >
          {t("booking.received")}
        </h2>
        <p className="text-muted-foreground mx-auto mt-3 max-w-md text-sm leading-relaxed">
          {t("booking.confirmation", { total: confirmation.totalPrice })}
        </p>
        <p className="bg-muted mx-auto mt-5 w-fit rounded-full px-4 py-2 font-mono text-xs">
          {t("booking.reference", { id: confirmation.id })}
        </p>
        <p className="text-muted-foreground mx-auto mt-4 max-w-md text-xs leading-relaxed">
          {t("booking.responseTime")}
        </p>
        <Button
          className="mt-6"
          variant="outline"
          nativeButton={false}
          render={<Link href="/car" />}
        >
          {t("booking.backToFleet")}
        </Button>
      </div>
    );
  }

  const fieldError = (name: keyof FormValues) => {
    const message = errors[name]?.message;
    if (!message) return null;
    return (
      <p id={`${name}-error`} role="alert" className="text-destructive text-sm">
        {message}
      </p>
    );
  };

  const fieldA11y = (name: keyof FormValues) => ({
    "aria-invalid": errors[name] ? (true as const) : undefined,
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  });

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="grid min-w-0 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]"
      noValidate
    >
      <div className="min-w-0 space-y-6">
        <section className="bg-card min-w-0 rounded-2xl p-5 shadow-sm sm:p-7">
          <SectionHeading
            number="01"
            title={t("booking.tripSection")}
            description={t("booking.tripSectionText")}
          />

          <div className="mt-6 space-y-3">
            <input type="hidden" {...register("vehicleId")} />
            <div className="border-border flex items-center gap-3 rounded-xl border p-3">
              <span className="bg-media relative h-14 w-20 shrink-0 overflow-hidden rounded-lg">
                {vehicle.imageUrl && (
                  <Image
                    src={vehicle.imageUrl}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {vehicle.label}
                </span>
                <span className="text-muted-foreground mt-0.5 block text-xs">
                  {vehicle.category} · {vehicle.transmission} · {vehicle.seats}{" "}
                  {t("detail.seats").toLocaleLowerCase()}
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                className="text-muted-foreground shrink-0"
                render={<Link href={changeVehicleHref} />}
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {t("booking.changeVehicle")}
                </span>
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="from">{t("booking.pickupDate")}</Label>
              <Controller
                control={control}
                name="from"
                render={({ field }) => (
                  <DatePicker
                    id="from"
                    value={fromDateValue(field.value)}
                    onChange={(date) => {
                      const nextFrom = date ? toDateValue(date) : "";
                      field.onChange(nextFrom);
                      setServerError(null);
                      if (
                        pickedTo &&
                        !isBookingRangeAvailable(
                          nextFrom,
                          pickedTo,
                          bookingCalendar
                        )
                      ) {
                        setValue("to", "", {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                      }
                    }}
                    minDate={minDate}
                    maxDate={latestPickupDate}
                    unavailableDates={unavailablePickup}
                    placeholder={t("booking.pickupDate")}
                    {...fieldA11y("from")}
                  />
                )}
              />
              {fieldError("from")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="to">{t("booking.returnDate")}</Label>
              <Controller
                control={control}
                name="to"
                render={({ field }) => (
                  <DatePicker
                    id="to"
                    value={fromDateValue(field.value)}
                    onChange={(date) => {
                      field.onChange(date ? toDateValue(date) : "");
                      setServerError(null);
                    }}
                    minDate={fromDateValue(pickedFrom) ?? minDate}
                    maxDate={latestReturnDate}
                    unavailableDates={unavailableReturn}
                    placeholder={t("booking.returnDate")}
                    {...fieldA11y("to")}
                  />
                )}
              />
              {fieldError("to")}
            </div>
          </div>
          {bookingCalendar.blockedRanges.length > 0 && (
            <p className="text-muted-foreground mt-3 flex items-center gap-2 text-xs">
              <span className="bg-destructive/70 h-2 w-2 rounded-full" />
              {t("availability.unavailableDates")}
            </p>
          )}
        </section>

        <section className="bg-card rounded-2xl p-5 shadow-sm sm:p-7">
          <SectionHeading
            number="02"
            title={t("booking.detailsSection")}
            description={t("booking.detailsSectionText")}
          />

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <FormField
              label={t("booking.firstName")}
              name="firstName"
              error={fieldError("firstName")}
            >
              <Input
                id="firstName"
                autoComplete="given-name"
                {...register("firstName")}
                {...fieldA11y("firstName")}
              />
            </FormField>
            <FormField
              label={t("booking.lastName")}
              name="lastName"
              error={fieldError("lastName")}
            >
              <Input
                id="lastName"
                autoComplete="family-name"
                {...register("lastName")}
                {...fieldA11y("lastName")}
              />
            </FormField>
            <FormField
              label={t("booking.email")}
              name="email"
              error={fieldError("email")}
            >
              <Input
                id="email"
                type="email"
                autoComplete="email"
                {...register("email")}
                {...fieldA11y("email")}
              />
            </FormField>
            <FormField
              label={t("booking.phone")}
              name="phone"
              error={fieldError("phone")}
            >
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                placeholder="+383 44 …"
                {...register("phone")}
                {...fieldA11y("phone")}
              />
            </FormField>
          </div>

          <div className="mt-4 space-y-2">
            <Label htmlFor="notes">{t("booking.notes")}</Label>
            <Textarea
              id="notes"
              rows={3}
              placeholder={t("booking.notesPlaceholder")}
              {...register("notes")}
              {...fieldA11y("notes")}
            />
            {fieldError("notes")}
          </div>
        </section>
      </div>

      <aside className="bg-card top-24 rounded-2xl p-5 shadow-sm lg:sticky">
        <h2 className="font-display font-bold">{t("booking.summary")}</h2>
        <div className="mt-4">
          <div className="bg-media relative aspect-[16/9] overflow-hidden rounded-xl">
            {vehicle.imageUrl && (
              <Image
                src={vehicle.imageUrl}
                alt={vehicle.label}
                fill
                sizes="320px"
                className="object-cover"
              />
            )}
          </div>
          <p className="mt-4 font-semibold">{vehicle.label}</p>
          <p className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
            <Users className="h-3.5 w-3.5" />
            {vehicle.seats} {t("detail.seats").toLocaleLowerCase()}
            <span aria-hidden="true">·</span>
            {vehicle.transmission}
          </p>
          <div className="border-divider mt-4 space-y-3 border-t pt-4 text-sm">
            {(pickedFrom || pickedTo) && (
              <p className="text-muted-foreground flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                {pickedFrom || "—"} → {pickedTo || "—"}
              </p>
            )}
            <div className="flex items-end justify-between gap-3">
              <span className="text-muted-foreground">
                {estimatedTotal
                  ? `${rentalDays} × ${vehicle.pricePerDay} EUR`
                  : t("booking.estimated")}
              </span>
              <strong className="font-display text-xl">
                {estimatedTotal ?? vehicle.pricePerDay} EUR
              </strong>
            </div>
          </div>
        </div>

        {serverError && (
          <p role="alert" className="text-destructive mt-4 text-sm">
            {serverError}
          </p>
        )}
        <Button
          type="submit"
          size="lg"
          className="mt-5 w-full"
          disabled={isSubmitting}
        >
          {isSubmitting ? t("booking.sending") : t("booking.send")}
        </Button>
        <PendingStatus message={isSubmitting ? t("booking.sending") : null} />
        <p className="text-muted-foreground mt-3 text-center text-xs leading-relaxed">
          {t("booking.noPayment")}
        </p>
      </aside>
    </form>
  );
}

function SectionHeading({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3">
      <span className="bg-foreground text-background flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold">
        {number}
      </span>
      <div>
        <h2 className="font-display text-lg font-bold">{title}</h2>
        <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>
      </div>
    </div>
  );
}

function FormField({
  label,
  name,
  error,
  children,
}: {
  label: string;
  name: string;
  error: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      {children}
      {error}
    </div>
  );
}
