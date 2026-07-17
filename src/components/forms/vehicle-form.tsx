"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { DateField } from "@/components/forms/date-range-picker";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
};

export function VehicleForm({ action, vehicle, onDeleteVehicle }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState<"discard" | "delete" | null>(null);
  const [pending, startTransition] = useTransition();
  const [deleting, startDelete] = useTransition();

  const submit = (formData: FormData) => {
    setError(null);
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

  return (
    <form
      ref={formRef}
      action={submit}
      onChange={() => setDirty(true)}
      className="space-y-5 pb-4"
    >
      {/* Sticky action bar — the decisions travel with the operator. */}
      <div className="bg-background/85 sticky top-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="min-w-0">
          <h1 className="font-display truncate text-xl font-bold tracking-tight">
            {vehicle ? `${vehicle.brand} ${vehicle.model}` : "New vehicle"}
          </h1>
          <p className="text-muted-foreground text-xs">
            {vehicle?.plate ? (
              <span className="font-mono">{vehicle.plate}</span>
            ) : (
              "Fleet details"
            )}
            {dirty && (
              <span className="text-status-maint ml-2 font-semibold">
                Unsaved changes
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
              <span className="hidden sm:inline">Delete vehicle</span>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => (dirty ? setConfirm("discard") : leave())}
          >
            Cancel
          </Button>
          <Button type="submit" variant="success" size="sm" disabled={pending}>
            {pending
              ? "Saving..."
              : vehicle
                ? "Save changes"
                : "Create vehicle"}
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
        {/* Left: what the car is */}
        <Card title="Specifications" icon={Car}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Brand" htmlFor="brand" icon={Car}>
              <Input
                id="brand"
                name="brand"
                defaultValue={vehicle?.brand}
                required
              />
            </Field>
            <Field label="Model" htmlFor="model" icon={Car}>
              <Input
                id="model"
                name="model"
                defaultValue={vehicle?.model}
                required
              />
            </Field>
            <Field label="Year" htmlFor="year" icon={CalendarDays}>
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
            <Field label="Category" htmlFor="category" icon={Layers}>
              <Select
                id="category"
                name="category"
                defaultValue={vehicle?.category ?? "SEDAN"}
              >
                {Object.values(VehicleCategory).map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0) + c.slice(1).toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Seats" htmlFor="seats" icon={Users}>
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
              label="Price per day"
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

          <Field label="Description" htmlFor="description" className="mt-4">
            <Textarea
              id="description"
              name="description"
              rows={4}
              defaultValue={vehicle?.description}
              required
              minLength={10}
              placeholder="What makes this one worth renting?"
            />
          </Field>
        </Card>

        {/* Right: how it is doing */}
        <div className="space-y-5">
          <Card title="Operational status" icon={CircleGauge}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Status" htmlFor="status" icon={CircleGauge}>
                <Select
                  id="status"
                  name="status"
                  defaultValue={vehicle?.status ?? "AVAILABLE"}
                >
                  {Object.values(VehicleStatus).map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0) + s.slice(1).toLowerCase()}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Registration plate" htmlFor="plate" icon={Hash}>
                <Input
                  id="plate"
                  name="plate"
                  defaultValue={vehicle?.plate ?? ""}
                  placeholder="01-234-AB"
                  className="font-mono uppercase"
                />
              </Field>
              <Field label="Transmission" htmlFor="transmission" icon={Cog}>
                <Select
                  id="transmission"
                  name="transmission"
                  defaultValue={vehicle?.transmission ?? "MANUAL"}
                >
                  {Object.values(Transmission).map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0) + t.slice(1).toLowerCase()}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Fuel" htmlFor="fuelType" icon={FuelIcon}>
                <Select
                  id="fuelType"
                  name="fuelType"
                  defaultValue={vehicle?.fuelType ?? "PETROL"}
                >
                  {Object.values(FuelType).map((f) => (
                    <option key={f} value={f}>
                      {f.charAt(0) + f.slice(1).toLowerCase()}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>

          <Card title="Registration" icon={ShieldCheck}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Registered on"
                htmlFor="registrationDate"
                icon={CalendarDays}
              >
                <DateField
                  id="registrationDate"
                  name="registrationDate"
                  defaultValue={vehicle?.registrationDate}
                />
              </Field>
              <Field
                label="Expires"
                htmlFor="registrationExpiry"
                icon={CalendarDays}
              >
                <DateField
                  id="registrationExpiry"
                  name="registrationExpiry"
                  defaultValue={vehicle?.registrationExpiry}
                />
              </Field>
            </div>
          </Card>

          <Card
            title="Service"
            icon={Wrench}
            subtitle="Routine upkeep — repairs are logged below"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Last service"
                htmlFor="lastServiceDate"
                icon={CalendarDays}
              >
                <DateField
                  id="lastServiceDate"
                  name="lastServiceDate"
                  defaultValue={vehicle?.lastServiceDate}
                />
              </Field>
              <Field
                label="Next due"
                htmlFor="nextServiceDate"
                icon={CalendarDays}
              >
                <DateField
                  id="nextServiceDate"
                  name="nextServiceDate"
                  defaultValue={vehicle?.nextServiceDate}
                />
              </Field>
            </div>
            <Field
              label="Service notes"
              htmlFor="serviceNotes"
              className="mt-4"
            >
              <Textarea
                id="serviceNotes"
                name="serviceNotes"
                rows={2}
                defaultValue={vehicle?.serviceNotes ?? ""}
                placeholder="Oil and filters replaced, brake fluid due next time"
              />
            </Field>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirm === "discard"}
        tone="neutral"
        title="Discard your changes?"
        body="You have unsaved changes to this vehicle. Leaving now will lose them."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onCancel={() => setConfirm(null)}
        onConfirm={leave}
      />

      <ConfirmDialog
        open={confirm === "delete"}
        pending={deleting}
        title="Delete this vehicle?"
        body="This action cannot be undone. Vehicles with rental history are retired instead, so past reservations stay intact."
        confirmLabel="Delete vehicle"
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
  children,
}: {
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card rounded-xl border shadow-xs">
      <div className="border-b px-5 py-3">
        <h2 className="font-display flex items-center gap-2 text-sm font-bold">
          <Icon className="text-brand h-4 w-4" />
          {title}
        </h2>
        {subtitle && (
          <p className="text-muted-foreground mt-0.5 text-xs">{subtitle}</p>
        )}
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
      className="border-input bg-card focus:border-ring focus:ring-ring/30 h-9 w-full cursor-pointer rounded-lg border px-3 text-sm transition-colors outline-none focus:ring-2"
    >
      {children}
    </select>
  );
}
