"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { enUS, sq } from "date-fns/locale";
import { ClipboardCheck, Pencil, Plus, Trash2 } from "lucide-react";
import type { VehicleDetail } from "./detail-actions";
import { SectionTitle } from "./detail-primitives";
import {
  addVehicleServiceAction,
  deleteVehicleServiceAction,
  updateVehicleServiceAction,
} from "./vehicles/actions";
import { DateField, toLocalDay } from "@/components/forms/date-range-picker";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { toasts } from "@/components/dashboard/toaster";
import { PendingStatus } from "@/components/shared/pending-status";
import { useI18n } from "@/components/shared/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatEur } from "@/lib/money";
import { formatNumber } from "@/lib/number-format";
import { SERVICE_FIELD_NAMES } from "@/lib/validations/vehicle-service";

type Service = VehicleDetail["vehicle"]["services"][number];

/**
 * The car's routine services, newest first, recorded where the owner reads
 * the car's costs. Each one counts towards "Recorded costs"; the newest is
 * the car's last service.
 *
 * Editing is offered to admins only, matching the actions (and repairs).
 * That is a hint for the UI: the actions check the role themselves.
 */
export function VehicleServices({
  detail,
  onChanged,
}: {
  detail: VehicleDetail;
  /** Reloads the drawer in place, so the cost figures follow the change. */
  onChanged: () => void;
}) {
  const { locale, t } = useI18n();
  const dateLocale = locale === "sq" ? sq : enUS;
  const { vehicle, viewerIsAdmin } = detail;
  /** "new", a service id being edited, or nothing open. */
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Service | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const remove = (service: Service) => {
    setError(null);
    startTransition(async () => {
      const result = await deleteVehicleServiceAction(vehicle.id, service.id);
      setDeleting(null);
      if (result?.error) {
        setError(result.error);
        return;
      }
      toasts.success(t("toast.serviceDeleted"));
      onChanged();
    });
  };

  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <SectionTitle icon={ClipboardCheck}>
          {t("admin.servicesTitle", { count: vehicle.services.length })}
        </SectionTitle>
        {viewerIsAdmin && editing === null && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setError(null);
              setEditing("new");
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("admin.addService")}
          </Button>
        )}
      </div>

      {editing === "new" && (
        <ServiceForm
          vehicleId={vehicle.id}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}

      {error && (
        <p role="alert" className="text-destructive mb-2 text-sm">
          {error}
        </p>
      )}

      {vehicle.services.length === 0 ? (
        <p className="text-muted-foreground rounded-none border border-dashed px-3 py-3 text-xs">
          {t("admin.noServices")}
        </p>
      ) : (
        <ul className="divide-y">
          {vehicle.services.map((s) =>
            editing === s.id ? (
              <li key={s.id} className="py-2">
                <ServiceForm
                  vehicleId={vehicle.id}
                  service={s}
                  onCancel={() => setEditing(null)}
                  onSaved={() => {
                    setEditing(null);
                    onChanged();
                  }}
                />
              </li>
            ) : (
              <li key={s.id} className="flex items-start gap-2 py-2 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {format(toLocalDay(s.date), "dd MMM yyyy", {
                      locale: dateLocale,
                    })}
                    {s.mileage !== null && (
                      <span className="text-muted-foreground font-normal">
                        {" · "}
                        {t("admin.serviceAtKm", {
                          km: formatNumber(s.mileage, locale),
                        })}
                      </span>
                    )}
                  </p>
                  {s.notes && (
                    <p className="text-muted-foreground break-words">
                      {s.notes}
                    </p>
                  )}
                </div>
                <span className="shrink-0 tabular-nums">
                  {formatEur(s.cost, locale)}
                </span>
                {viewerIsAdmin && editing === null && (
                  <span className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      aria-label={t("admin.editService")}
                      className="text-muted-foreground hover:text-foreground cursor-pointer p-1 transition-colors"
                      onClick={() => {
                        setError(null);
                        setEditing(s.id);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={t("admin.deleteService")}
                      className="text-muted-foreground hover:text-destructive cursor-pointer p-1 transition-colors"
                      onClick={() => setDeleting(s)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
              </li>
            )
          )}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={t("admin.deleteServiceTitle")}
        body={
          deleting
            ? t("admin.deleteServiceBody", {
                date: format(toLocalDay(deleting.date), "dd MMM yyyy", {
                  locale: dateLocale,
                }),
                amount: formatEur(deleting.cost, locale),
              })
            : ""
        }
        confirmLabel={t("admin.delete")}
        pending={pending}
        onConfirm={() => deleting && remove(deleting)}
        onCancel={() => setDeleting(null)}
      />
      <PendingStatus message={pending ? t("admin.saving") : null} />
    </section>
  );
}

/** Adds a service, or edits `service` when given. */
function ServiceForm({
  vehicleId,
  service,
  onSaved,
  onCancel,
}: {
  vehicleId: string;
  service?: Service;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Ids must be unique in the drawer: one form per row could be open in
  // principle, and the add form sits above the list.
  const idPrefix = `service-${service?.id ?? "new"}`;
  const fieldId = (key: keyof typeof SERVICE_FIELD_NAMES) =>
    `${idPrefix}-${key}`;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = service
        ? await updateVehicleServiceAction(vehicleId, service.id, formData)
        : await addVehicleServiceAction(vehicleId, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      toasts.success(t(service ? "toast.serviceSaved" : "toast.serviceAdded"));
      onSaved();
    });
  };

  return (
    <form
      onSubmit={submit}
      className="bg-secondary mb-3 space-y-3 rounded-none border p-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={fieldId("date")}>{t("admin.date")}</Label>
          {/* Required, so no clear. Future days are refused: a service
              booked ahead belongs in "Next due". */}
          <DateField
            id={fieldId("date")}
            name={SERVICE_FIELD_NAMES.date}
            defaultValue={service?.date ?? new Date()}
            maxDate={new Date()}
            clearable={false}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={fieldId("cost")}>{t("admin.cost")}</Label>
          <Input
            id={fieldId("cost")}
            name={SERVICE_FIELD_NAMES.cost}
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0}
            required
            defaultValue={service ? String(service.cost) : undefined}
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={fieldId("mileage")}>{t("admin.mileage")}</Label>
          <Input
            id={fieldId("mileage")}
            name={SERVICE_FIELD_NAMES.mileage}
            type="number"
            inputMode="numeric"
            step="1"
            min={0}
            defaultValue={service?.mileage ?? undefined}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={fieldId("notes")}>{t("admin.notes")}</Label>
          <Input
            id={fieldId("notes")}
            name={SERVICE_FIELD_NAMES.notes}
            maxLength={500}
            placeholder={t("admin.serviceWorkPlaceholder")}
            defaultValue={service?.notes ?? undefined}
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" variant="success" disabled={pending}>
          {pending ? t("admin.saving") : t("admin.saveService")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onCancel}
          disabled={pending}
        >
          {t("common.cancel")}
        </Button>
      </div>
      <PendingStatus message={pending ? t("admin.saving") : null} />
    </form>
  );
}
