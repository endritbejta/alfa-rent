"use client";

import { useCallback, useState, useTransition } from "react";
import type { ReservationStatus } from "@prisma/client";
import { ClipboardCheck } from "lucide-react";
import {
  recordRentalInspectionAction,
  signInspectionUploadAction,
} from "./actions";
import { InspectionPhotoUpload } from "./inspection-photo-upload";
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
import { toasts } from "@/components/dashboard/toaster";

export function InspectionAction({
  reservationId,
  status,
  timing,
  signerName,
  onSuccess,
}: {
  reservationId: string;
  status: ReservationStatus;
  timing: ReservationTiming;
  signerName: string;
  onSuccess?: () => void;
}) {
  const { t } = useI18n();
  const type = status === "CONFIRMED" ? "PICKUP" : "RETURN";
  const visible = status === "CONFIRMED" || status === "ACTIVE";
  const disabled = type === "PICKUP" && !timing.canStart;
  const [open, setOpen] = useState(false);
  const [fuel, setFuel] = useState(100);
  const [damage, setDamage] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  const submit = (formData: FormData) => {
    setError(null);
    if (
      !String(formData.get("mileage") ?? "").trim() ||
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
      <Button
        size="sm"
        variant="success"
        disabled={disabled}
        title={
          disabled
            ? timing.startBlockedReason === "Rental window has ended"
              ? t("admin.rentalWindowEnded")
              : t("admin.availablePickupDate")
            : undefined
        }
        onClick={() => setOpen(true)}
      >
        <ClipboardCheck className="h-3.5 w-3.5" />
        {type === "PICKUP" ? t("admin.startRental") : t("admin.completeRental")}
      </Button>

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

          <form action={submit} noValidate className="space-y-4">
            <input type="hidden" name="type" value={type} />

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

            <div className="rounded-lg border p-3">
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
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {disabled && timing.startBlockedReason && (
        <p className="text-muted-foreground max-w-52 text-right text-xs">
          {timing.startBlockedReason === "Rental window has ended"
            ? t("admin.rentalWindowEnded")
            : t("admin.availablePickupDate")}
        </p>
      )}
    </>
  );
}
