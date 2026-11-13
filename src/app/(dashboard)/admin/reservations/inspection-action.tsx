"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { ReservationStatus } from "@prisma/client";
import { ClipboardCheck, TriangleAlert } from "lucide-react";
import {
  getPickupMileageAction,
  recordRentalInspectionAction,
  signInspectionUploadAction,
} from "./actions";
import { InspectionPhotoUpload } from "./inspection-photo-upload";
import { formatDay } from "./format-day";
import {
  LateReturnChoice,
  NO_LATE_CHOICE,
  lateChoiceProblem,
  type LateChoice,
} from "./late-return-choice";
import {
  EarlyReturnChoice,
  NO_EARLY_CHOICE,
  earlyChoiceProblem,
  type EarlyChoice,
} from "./early-return-choice";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ReservationTiming } from "@/lib/reservation-lifecycle";
import { useI18n } from "@/components/shared/locale-provider";
import { PendingStatus } from "@/components/shared/pending-status";
import { formatNumber } from "@/lib/number-format";
import { toasts } from "@/components/dashboard/toaster";

export function InspectionAction({
  reservationId,
  status,
  timing,
  signerName,
  pricePerDay,
  totalPrice,
  dailyRate,
  vehicleName,
  onSuccess,
  open: openProp,
  onOpenChange,
  hideTrigger = false,
}: {
  reservationId: string;
  status: ReservationStatus;
  timing: ReservationTiming;
  signerName: string;
  /** The car's rate today and the booking's total, for a late return. */
  pricePerDay: number;
  totalPrice: number;
  /**
   * The rate the booking was agreed at, for an early return; null for a
   * row without one, which is billed at the car's rate as the service does.
   */
  dailyRate: number | null;
  vehicleName: string;
  onSuccess?: () => void;
  /**
   * Controlled open state, for a parent that opens the dialog from its own
   * control (the row's "more actions" menu) and so hides this trigger.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  const { locale, t } = useI18n();
  const type = status === "CONFIRMED" ? "PICKUP" : "RETURN";
  const visible = status === "CONFIRMED" || status === "ACTIVE";
  const disabled = type === "PICKUP" && !timing.canStart;
  // A start after the pickup day is a late one: allowed, but confirmed and
  // dated. A return after the return day can likewise be dated, so a rental
  // started late can be completed on the day the car really came back.
  const lateStart = type === "PICKUP" && timing.lateStart;
  // Once the whole window has gone, the car most likely left on the day it
  // was booked for; inside the window, most likely today.
  const defaultHandover =
    timing.today > timing.returnDay ? timing.pickupDay : timing.today;
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };
  const [fuel, setFuel] = useState(100);
  const [damage, setDamage] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [pickupMileage, setPickupMileage] = useState<number | null>(null);
  // The day the car came back. Controlled, so a return dated after the
  // booked return day shows its late days and price as the date changes.
  const [returnedOn, setReturnedOn] = useState(timing.today);
  const [lateChoice, setLateChoice] = useState<LateChoice>(NO_LATE_CHOICE);
  const [earlyChoice, setEarlyChoice] = useState<EarlyChoice>(NO_EARLY_CHOICE);

  // The return form shows where the odometer started.
  useEffect(() => {
    if (!open || type !== "RETURN") return;
    let cancelled = false;
    getPickupMileageAction(reservationId)
      .then((km) => {
        if (!cancelled) setPickupMileage(km);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, type, reservationId]);

  const sign = useCallback(
    () => signInspectionUploadAction(reservationId, type),
    [reservationId, type]
  );
  const onUploadStateChange = useCallback(
    ({
      uploading: nextUploading,
      hasErrors,
    }: {
      uploading: boolean;
      hasErrors: boolean;
    }) => {
      setUploading(nextUploading);
      setUploadErrors(hasErrors);
    },
    []
  );

  if (!visible) return null;

  /**
   * The late- and early-return choices are checked before the action runs,
   * not inside it: React resets an action form once its action returns, so
   * refusing there would wipe the mileage and signature staff just entered.
   */
  const checkReturnChoice = (event: React.FormEvent<HTMLFormElement>) => {
    if (type !== "RETURN") return;
    const problem =
      lateChoiceProblem(timing.returnDay, returnedOn, lateChoice) ??
      earlyChoiceProblem(
        timing.pickupDay,
        timing.returnDay,
        returnedOn,
        earlyChoice
      );
    if (!problem) return;
    event.preventDefault();
    setError(
      problem.key === "admin.lateReasonTooShort"
        ? t(problem.key, { min: problem.min })
        : t(problem.key)
    );
  };

  const submit = (formData: FormData) => {
    setError(null);
    if (lateStart && formData.get("lateStartConfirmed") !== "on") {
      setError(t("err.lateStartUnconfirmed"));
      return;
    }
    if (
      !String(formData.get("mileage") ?? "").trim() ||
      ((lateStart || type === "RETURN") &&
        !String(formData.get("occurredOn") ?? "").trim()) ||
      !String(formData.get("signerName") ?? "").trim() ||
      formData.get("customerAcknowledged") !== "on" ||
      (formData.get("damageFound") === "on" &&
        !String(formData.get("damageNotes") ?? "").trim())
    ) {
      setError(t("admin.requiredField"));
      return;
    }
    startTransition(async () => {
      const result = await recordRentalInspectionAction(
        reservationId,
        formData
      );
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      toasts.success(t("toast.inspectionRecorded"));
      onSuccess?.();
    });
  };

  return (
    <>
      {!hideTrigger && (
        <Button
          size="sm"
          // Once the whole rental is in the past, recording it as completed is
          // the usual move; starting it stays for a car that is still out.
          variant={
            type === "PICKUP" && timing.canRecordPast ? "outline" : "success"
          }
          disabled={disabled}
          title={disabled ? t("admin.availablePickupDate") : undefined}
          onClick={() => setOpen(true)}
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
          {type === "PICKUP"
            ? t("admin.startRental")
            : t("admin.completeRental")}
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {type === "PICKUP"
                ? t("admin.pickupInspection")
                : t("admin.returnInspection")}
            </DialogTitle>
            <DialogDescription>
              {type === "PICKUP"
                ? t("admin.pickupInspectionHelp")
                : t("admin.returnInspectionHelp")}
            </DialogDescription>
          </DialogHeader>

          <form
            action={submit}
            onSubmit={checkReturnChoice}
            noValidate
            className="space-y-4"
          >
            <input type="hidden" name="type" value={type} />

            {lateStart && (
              <div
                role="note"
                className="border-destructive/40 bg-destructive/5 space-y-3 rounded-none border p-3"
              >
                <p className="text-destructive flex items-center gap-2 text-sm font-semibold">
                  <TriangleAlert aria-hidden className="h-4 w-4 shrink-0" />
                  {t("admin.lateStartTitle")}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t("admin.lateStartHelp", {
                    date: formatDay(timing.pickupDay),
                  })}
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor={`${reservationId}-occurred`}>
                    {t("admin.handoverDate")}
                  </Label>
                  <Input
                    id={`${reservationId}-occurred`}
                    name="occurredOn"
                    type="date"
                    required
                    min={timing.pickupDay}
                    max={timing.today}
                    defaultValue={defaultHandover}
                    className="w-auto"
                  />
                </div>
                <label className="flex cursor-pointer items-start gap-2 text-xs font-semibold">
                  <input
                    type="checkbox"
                    name="lateStartConfirmed"
                    required
                    className="accent-brand mt-0.5 h-4 w-4 shrink-0"
                  />
                  {t("admin.lateStartConfirm")}
                </label>
              </div>
            )}

            {/*
              The day it came back, for every return: today by default, an
              earlier day when the car came back before it was recorded, and
              a day before the booked return is an early return to bill.
            */}
            {type === "RETURN" && (
              <div className="space-y-1.5">
                <Label htmlFor={`${reservationId}-occurred`}>
                  {t("admin.returnDate")}
                </Label>
                <Input
                  id={`${reservationId}-occurred`}
                  name="occurredOn"
                  type="date"
                  required
                  // The server bounds it by the recorded handover too.
                  min={timing.pickupDay}
                  max={timing.today}
                  value={returnedOn}
                  onChange={(event) => setReturnedOn(event.target.value)}
                  aria-describedby={`${reservationId}-occurred-help`}
                  className="w-auto"
                />
                <p
                  id={`${reservationId}-occurred-help`}
                  className="text-muted-foreground text-xs"
                >
                  {t("admin.returnDateHelp", {
                    date: formatDay(timing.returnDay),
                  })}
                </p>
              </div>
            )}

            {type === "RETURN" && (
              <LateReturnChoice
                idPrefix={reservationId}
                returnDay={timing.returnDay}
                returnedOn={returnedOn}
                pricePerDay={pricePerDay}
                totalPrice={totalPrice}
                choice={lateChoice}
                onChange={setLateChoice}
              />
            )}

            {type === "RETURN" && (
              <EarlyReturnChoice
                idPrefix={reservationId}
                pickupDay={timing.pickupDay}
                returnDay={timing.returnDay}
                returnedOn={returnedOn}
                dailyRate={dailyRate ?? pricePerDay}
                bookedTotal={totalPrice}
                customerName={signerName}
                vehicleName={vehicleName}
                choice={earlyChoice}
                onChange={setEarlyChoice}
              />
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${reservationId}-mileage`}>
                  {t("admin.mileage")}
                </Label>
                <Input
                  id={`${reservationId}-mileage`}
                  name="mileage"
                  type="number"
                  min={0}
                  max={2_000_000}
                  step={1}
                  required
                  placeholder={t("admin.mileagePlaceholder")}
                />
                {type === "RETURN" && pickupMileage !== null && (
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {t("admin.pickupMileage", {
                      km: formatNumber(pickupMileage, locale),
                    })}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`${reservationId}-fuel`}>
                    {t("admin.fuelLevel")}
                  </Label>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {fuel}%
                  </span>
                </div>
                <input
                  id={`${reservationId}-fuel`}
                  name="fuelLevel"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={fuel}
                  onChange={(event) => setFuel(Number(event.target.value))}
                  className="accent-brand h-8 w-full cursor-pointer"
                />
              </div>
            </div>

            <InspectionPhotoUpload
              sign={sign}
              onStateChange={onUploadStateChange}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${reservationId}-exterior`}>
                  {t("admin.exteriorCondition")}
                </Label>
                <Textarea
                  id={`${reservationId}-exterior`}
                  name="exteriorNotes"
                  maxLength={1000}
                  placeholder={t("admin.exteriorPlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${reservationId}-interior`}>
                  {t("admin.interiorCondition")}
                </Label>
                <Textarea
                  id={`${reservationId}-interior`}
                  name="interiorNotes"
                  maxLength={1000}
                  placeholder={t("admin.interiorPlaceholder")}
                />
              </div>
            </div>

            <div className="rounded-none border p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  name="damageFound"
                  checked={damage}
                  onChange={(event) => setDamage(event.target.checked)}
                  className="accent-brand h-4 w-4"
                />
                {type === "PICKUP"
                  ? t("admin.existingDamage")
                  : t("admin.newDamage")}
              </label>
              {damage && (
                <Textarea
                  name="damageNotes"
                  required
                  maxLength={1500}
                  className="mt-3"
                  placeholder={t("admin.damagePlaceholder")}
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${reservationId}-signer`}>
                {t("admin.customerAcknowledgement")}
              </Label>
              <Input
                id={`${reservationId}-signer`}
                name="signerName"
                defaultValue={signerName}
                minLength={2}
                maxLength={100}
                required
              />
              <label className="text-muted-foreground flex cursor-pointer items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  name="customerAcknowledged"
                  required
                  className="accent-brand mt-0.5 h-4 w-4 shrink-0"
                />
                {t("admin.acknowledgementHelp")}
              </label>
            </div>

            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}

            <DialogFooter className="mx-0 mb-0 px-0 pb-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                variant="success"
                disabled={pending || uploading || uploadErrors}
              >
                {uploading
                  ? t("admin.uploadingPhotos")
                  : uploadErrors
                    ? t("admin.resolvePhotoErrors")
                    : pending
                      ? t("admin.savingInspection")
                      : type === "PICKUP"
                        ? t("admin.saveStartRental")
                        : t("admin.saveCompleteRental")}
              </Button>
              <PendingStatus
                message={
                  uploading
                    ? t("admin.uploadingPhotos")
                    : pending
                      ? t("admin.savingInspection")
                      : null
                }
              />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {disabled && timing.startBlockedReason && (
        <p className="text-muted-foreground order-last basis-full text-right text-xs">
          {t("admin.availablePickupDate")}
        </p>
      )}
    </>
  );
}
