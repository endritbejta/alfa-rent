"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addDays, format, startOfDay } from "date-fns";
import {
  VehicleCategory,
  VehicleStatus,
  Transmission,
  FuelType,
} from "@prisma/client";
import {
  Car,
  CalendarDays,
  CircleGauge,
  Cog,
  Euro,
  Fuel as FuelIcon,
  Hash,
  Layers,
  ShieldCheck,
  Trash2,
  Users,
  Wrench,
} from "lucide-react";
import type { ActionResult } from "@/app/(dashboard)/admin/vehicles/actions";
import { signVehicleUploadAction } from "@/app/(dashboard)/admin/vehicles/actions";
import { MediaGrid } from "@/components/forms/media-grid";
import {
  DateField,
  toDateValue,
  toLocalDay,
} from "@/components/forms/date-range-picker";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/components/shared/locale-provider";

/**
 * A plain, already-serialized vehicle — deliberately not Prisma's
 * VehicleWithImages. `pricePerDay` is a Decimal on the model, and handing a
 * Decimal to a client component is a hard RSC serialization error, so the
 * page maps it to a number at the boundary. Same shape of contract as
 * vehicle-grid's Item type.
 */
export type VehicleFormValues = {
  id: string;
  brand: string;
  model: string;
  plate: string | null;
  year: number;
  category: VehicleCategory;
  transmission: Transmission;
  fuelType: FuelType;
  seats: number;
  pricePerDay: number;
  description: string;
  status: VehicleStatus;
  registrationDate: Date | null;
  registrationExpiry: Date | null;
  lastServiceDate: Date | null;
  nextServiceDate: Date | null;
  serviceNotes: string | null;
  images: { id: string; url: string }[];
};

type Props = {
  action: (formData: FormData) => Promise<ActionResult>;
  vehicle?: VehicleFormValues;
  onDeleteVehicle?: () => Promise<ActionResult>;
  repairsPanel?: React.ReactNode;
};

export function VehicleForm({
  action,
  vehicle,
  onDeleteVehicle,
  repairsPanel,
}: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [renewingRegistration, setRenewingRegistration] = useState(false);
  const [confirm, setConfirm] = useState<"discard" | "delete" | null>(null);
  const [pending, startTransition] = useTransition();
  const [deleting, startDelete] = useTransition();

  const submit = (formData: FormData) => {
    setError(null);
    if (
      vehicle &&
      renewingRegistration &&
      !formData.get("registrationExpiry")
    ) {
      setError(t("admin.chooseExpiryError"));
      return;
    }
    startTransition(async () => {
      const result = await action(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setDirty(false);
    });
  };

  const leave = () => router.push("/admin/vehicles");
  const currentRegistrationExpiry = vehicle?.registrationExpiry
    ? toLocalDay(vehicle.registrationExpiry)
    : undefined;
  const renewalMinDate = currentRegistrationExpiry
    ? new Date(
        Math.max(
          addDays(currentRegistrationExpiry, 1).getTime(),
          startOfDay(new Date()).getTime()
        )
      )
    : startOfDay(new Date());

  return (
    <form
      ref={formRef}
      action={submit}
      onChange={() => setDirty(true)}
      className="space-y-5 pb-4"
    >
      {/* Sticky action bar — the decisions travel with the operator. */}
      <div className="bg-card/90 sticky top-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 shadow-xs backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="min-w-0">
          <h1 className="font-display truncate text-xl font-bold tracking-tight">
            {vehicle
              ? `${vehicle.brand} ${vehicle.model}`
              : t("admin.newVehicle")}
          </h1>
          <p className="text-muted-foreground text-xs">
            {vehicle?.plate ? (
              <span className="font-mono">{vehicle.plate}</span>
            ) : (
              t("admin.fleetDetails")
            )}
            {dirty && (
              <span className="text-status-maint ml-2 font-semibold">
                {t("admin.unsavedChanges")}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {vehicle && onDeleteVehicle && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setConfirm("delete")}
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">
                {t("admin.deleteVehicle")}
              </span>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => (dirty ? setConfirm("discard") : leave())}
          >
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="success" size="sm" disabled={pending}>
            {pending
              ? t("admin.saving")
              : vehicle
                ? t("admin.saveChanges")
                : t("admin.createVehicle")}
          </Button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/[0.07] text-destructive rounded-lg border px-4 py-3 text-sm"
        >
          {error}
        </p>
      )}

      <MediaGrid
        name="images"
        vehicleId={vehicle?.id}
        existing={vehicle?.images ?? []}
        signUpload={signVehicleUploadAction}
        onDirty={() => setDirty(true)}
      />

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        {/* Independent stacks prevent a tall card from opening a hole opposite it. */}
        <div className="space-y-5">
          <Card title={t("admin.specifications")} icon={Car}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("admin.brand")} htmlFor="brand" icon={Car}>
                <Input
                  id="brand"
                  name="brand"
                  defaultValue={vehicle?.brand}
                  required
                />
              </Field>
              <Field label={t("admin.model")} htmlFor="model" icon={Car}>
                <Input
                  id="model"
                  name="model"
                  defaultValue={vehicle?.model}
                  required
                />
              </Field>
              <Field label={t("admin.year")} htmlFor="year" icon={CalendarDays}>
                <Input
                  id="year"
                  name="year"
                  type="number"
                  min={1990}
                  max={new Date().getFullYear() + 1}
                  defaultValue={vehicle?.year ?? new Date().getFullYear()}
                  required
                />
              </Field>
              <Field
                label={t("admin.category")}
                htmlFor="category"
                icon={Layers}
              >
                <Select
                  id="category"
                  name="category"
                  defaultValue={vehicle?.category ?? "SEDAN"}
                >
                  {Object.values(VehicleCategory).map((c) => (
                    <option key={c} value={c}>
                      {t(
                        `filter.${c.toLowerCase()}` as
                          | "filter.economy"
                          | "filter.compact"
                          | "filter.sedan"
                          | "filter.suv"
                          | "filter.luxury"
                          | "filter.van"
                      )}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("admin.seats")} htmlFor="seats" icon={Users}>
                <Input
                  id="seats"
                  name="seats"
                  type="number"
                  min={1}
                  max={20}
                  defaultValue={vehicle?.seats ?? 5}
                  required
                />
              </Field>
              <Field
                label={t("admin.pricePerDay")}
                htmlFor="pricePerDay"
                icon={Euro}
                hint="EUR"
              >
                <Input
                  id="pricePerDay"
                  name="pricePerDay"
                  type="number"
                  step="0.01"
                  min={1}
                  defaultValue={vehicle?.pricePerDay}
                  required
                />
              </Field>
            </div>

            <Field
              label={t("admin.description")}
              htmlFor="description"
              className="mt-4"
            >
              <Textarea
                id="description"
                name="description"
                rows={4}
                defaultValue={vehicle?.description}
                required
                minLength={10}
                placeholder={t("admin.descriptionPlaceholder")}
              />
            </Field>
          </Card>

          {repairsPanel}
        </div>

        {/* Right: operational, legal, and routine service status. */}
        <div className="space-y-5">
          <Card title={t("admin.operationalStatus")} icon={CircleGauge}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t("admin.status")}
                htmlFor="status"
                icon={CircleGauge}
              >
                <Select
                  id="status"
                  name="status"
                  defaultValue={vehicle?.status ?? "AVAILABLE"}
                >
                  {Object.values(VehicleStatus).map((s) => (
                    <option key={s} value={s}>
                      {s === "AVAILABLE"
                        ? t("vehicle.available")
                        : s === "RENTED"
                          ? t("vehicle.rented")
                          : s === "SERVICE"
                            ? t("vehicle.maintenance")
                            : t("vehicle.inactive")}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={t("admin.registrationPlate")}
                htmlFor="plate"
                icon={Hash}
              >
                <Input
                  id="plate"
                  name="plate"
                  defaultValue={vehicle?.plate ?? ""}
                  placeholder="01-234-AB"
                  className="font-mono uppercase"
                />
              </Field>
              <Field
                label={t("admin.transmission")}
                htmlFor="transmission"
                icon={Cog}
              >
                <Select
                  id="transmission"
                  name="transmission"
                  defaultValue={vehicle?.transmission ?? "MANUAL"}
                >
                  {Object.values(Transmission).map((transmission) => (
                    <option key={transmission} value={transmission}>
                      {transmission === "AUTOMATIC"
                        ? t("vehicle.automatic")
                        : t("vehicle.manual")}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("admin.fuel")} htmlFor="fuelType" icon={FuelIcon}>
                <Select
                  id="fuelType"
                  name="fuelType"
                  defaultValue={vehicle?.fuelType ?? "PETROL"}
                >
                  {Object.values(FuelType).map((f) => (
                    <option key={f} value={f}>
                      {t(
                        `vehicle.${f.toLowerCase()}` as
                          | "vehicle.petrol"
                          | "vehicle.diesel"
                          | "vehicle.hybrid"
                          | "vehicle.electric"
                      )}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,21rem),1fr))] gap-5">
            <Card
              title={t("admin.registration")}
              icon={ShieldCheck}
              action={
                vehicle ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-expanded={renewingRegistration}
                    aria-controls="registration-renewal"
                    onClick={() => setRenewingRegistration((value) => !value)}
                  >
                    {renewingRegistration
                      ? t("admin.cancelRenewal")
                      : t("admin.renewRegistration")}
                  </Button>
                ) : undefined
              }
            >
              <div className="grid gap-4">
                <Field
                  label={t("admin.registeredOn")}
                  htmlFor="registrationDate"
                  icon={CalendarDays}
                >
                  <DateField
                    id="registrationDate"
                    name="registrationDate"
                    defaultValue={vehicle?.registrationDate}
                    onChange={() => setDirty(true)}
                  />
                </Field>
                {vehicle ? (
                  <Field label={t("admin.currentExpiry")} icon={CalendarDays}>
                    <div className="border-input bg-secondary/50 flex h-9 items-center rounded-lg border px-3 text-sm">
                      {currentRegistrationExpiry
                        ? format(currentRegistrationExpiry, "dd MMM yyyy")
                        : t("admin.notRecorded")}
                    </div>
                  </Field>
                ) : (
                  <Field
                    label={t("admin.expires")}
                    htmlFor="registrationExpiry"
                    icon={CalendarDays}
                  >
                    <DateField
                      id="registrationExpiry"
                      name="registrationExpiry"
                      onChange={() => setDirty(true)}
                    />
                  </Field>
                )}
              </div>

              {vehicle && !renewingRegistration && (
                <input
                  type="hidden"
                  name="registrationExpiry"
                  value={
                    currentRegistrationExpiry
                      ? toDateValue(currentRegistrationExpiry)
                      : ""
                  }
                />
              )}

              {vehicle && renewingRegistration && (
                <div
                  id="registration-renewal"
                  className="border-brand/25 bg-brand/[0.06] mt-4 rounded-lg border p-4"
                >
                  <Field
                    label={t("admin.newExpiryDate")}
                    htmlFor="registrationExpiry"
                    icon={CalendarDays}
                  >
                    <DateField
                      id="registrationExpiry"
                      name="registrationExpiry"
                      minDate={renewalMinDate}
                      placeholder={t("admin.chooseNewExpiry")}
                      clearable={false}
                      onChange={() => setDirty(true)}
                    />
                  </Field>
                  <p className="text-muted-foreground mt-2 text-xs">
                    {t("admin.renewalHelp")}
                  </p>
                </div>
              )}
            </Card>

            <Card
              title={t("admin.service")}
              icon={Wrench}
              subtitle={t("admin.serviceSubtitle")}
            >
              <div className="grid gap-4">
                <Field
                  label={t("admin.lastService")}
                  htmlFor="lastServiceDate"
                  icon={CalendarDays}
                >
                  <DateField
                    id="lastServiceDate"
                    name="lastServiceDate"
                    defaultValue={vehicle?.lastServiceDate}
                    onChange={() => setDirty(true)}
                  />
                </Field>
                <Field
                  label={t("admin.nextDue")}
                  htmlFor="nextServiceDate"
                  icon={CalendarDays}
                >
                  <DateField
                    id="nextServiceDate"
                    name="nextServiceDate"
                    defaultValue={vehicle?.nextServiceDate}
                    onChange={() => setDirty(true)}
                  />
                </Field>
              </div>
              <Field
                label={t("admin.serviceNotes")}
                htmlFor="serviceNotes"
                className="mt-4"
              >
                <Textarea
                  id="serviceNotes"
                  name="serviceNotes"
                  rows={2}
                  defaultValue={vehicle?.serviceNotes ?? ""}
                  placeholder={t("admin.serviceNotesPlaceholder")}
                />
              </Field>
            </Card>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirm === "discard"}
        tone="neutral"
        title={t("admin.discardTitle")}
        body={t("admin.discardBody")}
        confirmLabel={t("admin.discardChanges")}
        cancelLabel={t("admin.keepEditing")}
        onCancel={() => setConfirm(null)}
        onConfirm={leave}
      />

      <ConfirmDialog
        open={confirm === "delete"}
        pending={deleting}
        title={t("admin.deleteVehicleTitle")}
        body={t("admin.deleteVehicleBody")}
        confirmLabel={t("admin.deleteVehicle")}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          startDelete(async () => {
            const result = await onDeleteVehicle?.();
            if (result?.error) {
              setError(result.error);
              setConfirm(null);
              return;
            }
            router.push("/admin/vehicles");
          })
        }
      />
    </form>
  );
}

function Card({
  title,
  subtitle,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card rounded-xl border shadow-xs">
      <div className="flex items-start justify-between gap-3 border-b px-5 py-3">
        <div>
          <h2 className="font-display flex items-center gap-2 text-sm font-bold">
            <Icon className="text-brand h-4 w-4" />
            {title}
          </h2>
          {subtitle && (
            <p className="text-muted-foreground mt-0.5 text-xs">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  icon: Icon,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  icon?: React.ElementType;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label
        htmlFor={htmlFor}
        className="text-muted-foreground mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.06em] uppercase"
      >
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
        {hint && <span className="text-muted-foreground/70">({hint})</span>}
      </Label>
      {children}
    </div>
  );
}

function Select({
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="border-input bg-control focus:border-ring focus:ring-ring/30 h-9 w-full cursor-pointer rounded-lg border px-3 text-sm transition-colors outline-none focus:ring-2"
    >
      {children}
    </select>
  );
}
