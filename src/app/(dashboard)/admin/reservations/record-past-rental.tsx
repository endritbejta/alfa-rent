"use client";

import { useState, useTransition } from "react";
import { History } from "lucide-react";
import { recordPastRentalAction } from "./actions";
import { formatDay } from "./format-day";
import {
  LateReturnChoice,
  NO_LATE_CHOICE,
  lateChoiceProblem,
  type LateChoice,
} from "./late-return-choice";
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
import { toasts } from "@/components/dashboard/toaster";

/**
 * Catching up on a rental that happened while nobody pressed Start: one
 * dialog, the booked days pre-filled, a reason instead of two inspections.
 *
 * Controlled fields and an onSubmit handler rather than `<form action>`:
 * React resets an action form after every submit, refused or not, and this
 * is the form staff fill in a dozen times in a row.
 */
export function RecordPastRental({
  reservationId,
  timing,
  pricePerDay,
  totalPrice,
  onSuccess,
  open: openProp,
  onOpenChange,
  hideTrigger = false,
}: {
  reservationId: string;
  timing: ReservationTiming;
  /** The car's rate today and the booking's total, for a late return. */
  pricePerDay: number;
  totalPrice: number;
  onSuccess?: () => void;
  /** Controlled open state; see `InspectionAction`. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  const { t } = useI18n();
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };
  const [startedOn, setStartedOn] = useState(timing.pickupDay);
  const [returnedOn, setReturnedOn] = useState(timing.returnDay);
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [lateChoice, setLateChoice] = useState<LateChoice>(NO_LATE_CHOICE);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!timing.canRecordPast) return null;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!startedOn || !returnedOn || note.trim().length < 5 || !confirmed) {
      setError(t("admin.requiredField"));
      return;
    }
    const problem = lateChoiceProblem(timing.returnDay, returnedOn, lateChoice);
    if (problem) {
      setError(
        problem.key === "admin.lateReasonTooShort"
          ? t(problem.key, { min: problem.min })
          : t(problem.key)
      );
      return;
    }
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await recordPastRentalAction(reservationId, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      toasts.success(t("toast.pastRentalRecorded"));
      onSuccess?.();
    });
  };

  const id = (field: string) => `${reservationId}-past-${field}`;

  return (
    <>
      {!hideTrigger && (
        <Button size="sm" variant="success" onClick={() => setOpen(true)}>
          <History className="h-3.5 w-3.5" />
          {t("admin.recordPastRental")}
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("admin.recordPastTitle")}</DialogTitle>
            <DialogDescription>{t("admin.recordPastHelp")}</DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} noValidate className="space-y-4">
            <p className="text-muted-foreground text-xs">
              {t("admin.recordPastBooked", {
                from: formatDay(timing.pickupDay),
                until: formatDay(timing.returnDay),
              })}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={id("started")}>
                  {t("admin.recordPastStarted")}
                </Label>
                <Input
                  id={id("started")}
                  name="startedOn"
                  type="date"
                  required
                  min={timing.pickupDay}
                  max={timing.today}
                  value={startedOn}
                  onChange={(event) => setStartedOn(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={id("returned")}>
                  {t("admin.recordPastReturned")}
                </Label>
                <Input
                  id={id("returned")}
                  name="returnedOn"
                  type="date"
                  required
                  min={startedOn || timing.pickupDay}
                  max={timing.today}
                  value={returnedOn}
                  onChange={(event) => setReturnedOn(event.target.value)}
                />
              </div>
            </div>

            <LateReturnChoice
              idPrefix={`${reservationId}-past`}
              returnDay={timing.returnDay}
              returnedOn={returnedOn}
              pricePerDay={pricePerDay}
              totalPrice={totalPrice}
              choice={lateChoice}
              onChange={setLateChoice}
            />

            <div className="space-y-1.5">
              <Label htmlFor={id("note")}>{t("admin.recordPastNote")}</Label>
              <Textarea
                id={id("note")}
                name="note"
                required
                minLength={5}
                maxLength={500}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t("admin.recordPastNotePlaceholder")}
              />
            </div>

            <label className="flex cursor-pointer items-start gap-2 text-xs font-semibold">
              <input
                type="checkbox"
                name="confirmed"
                required
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                className="accent-brand mt-0.5 h-4 w-4 shrink-0"
              />
              {t("admin.recordPastConfirm")}
            </label>

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
              <Button type="submit" variant="success" disabled={pending}>
                {pending
                  ? t("admin.recordPastSaving")
                  : t("admin.recordPastRental")}
              </Button>
              <PendingStatus
                message={pending ? t("admin.recordPastSaving") : null}
              />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
