"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import {
  VehicleCategory,
  VehicleStatus,
  Transmission,
  FuelType,
} from "@prisma/client";
import type { VehicleWithImages } from "@/services/vehicle.service";
import type { ActionResult } from "@/app/(dashboard)/admin/vehicles/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  action: (formData: FormData) => Promise<ActionResult>;
  vehicle?: VehicleWithImages;
  onDeleteImage?: (imageId: string) => Promise<ActionResult>;
};

/** Prisma dates -> yyyy-MM-dd for native date inputs. */
const toDateInput = (d: Date | null | undefined) =>
  d ? new Date(d).toISOString().slice(0, 10) : "";

const selectClass =
  "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm";

/**
 * Shared by create and edit. Native form + server action keeps file
 * uploads streaming through FormData; client-side state is only used
 * for error display and pending UI.
 */
export function VehicleForm({ action, vehicle, onDeleteImage }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await action(formData);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <form action={submit} className="max-w-2xl space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="brand">Brand</Label>
          <Input
            id="brand"
            name="brand"
            defaultValue={vehicle?.brand}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="model">Model</Label>
          <Input
            id="model"
            name="model"
            defaultValue={vehicle?.model}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="plate">Registration plate</Label>
          <Input
            id="plate"
            name="plate"
            defaultValue={vehicle?.plate ?? ""}
            placeholder="01-234-AB"
            className="uppercase"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="year">Year</Label>
          <Input
            id="year"
            name="year"
            type="number"
            min={1990}
            max={new Date().getFullYear() + 1}
            defaultValue={vehicle?.year ?? new Date().getFullYear()}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="seats">Seats</Label>
          <Input
            id="seats"
            name="seats"
            type="number"
            min={1}
            max={20}
            defaultValue={vehicle?.seats ?? 5}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <select
            id="category"
            name="category"
            className={selectClass}
            defaultValue={vehicle?.category ?? "SEDAN"}
          >
            {Object.values(VehicleCategory).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="transmission">Transmission</Label>
          <select
            id="transmission"
            name="transmission"
            className={selectClass}
            defaultValue={vehicle?.transmission ?? "MANUAL"}
          >
            {Object.values(Transmission).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="fuelType">Fuel</Label>
          <select
            id="fuelType"
            name="fuelType"
            className={selectClass}
            defaultValue={vehicle?.fuelType ?? "PETROL"}
          >
            {Object.values(FuelType).map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            name="status"
            className={selectClass}
            defaultValue={vehicle?.status ?? "AVAILABLE"}
          >
            {Object.values(VehicleStatus).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pricePerDay">Price per day (EUR)</Label>
          <Input
            id="pricePerDay"
            name="pricePerDay"
            type="number"
            step="0.01"
            min={1}
            defaultValue={vehicle ? Number(vehicle.pricePerDay) : undefined}
            required
          />
        </div>
      </div>

      <fieldset className="space-y-4 rounded-xl border p-4">
        <legend className="px-2 text-xs font-bold tracking-[0.1em] uppercase">
          Registration &amp; service
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="registrationDate">Registered on</Label>
            <Input
              id="registrationDate"
              name="registrationDate"
              type="date"
              defaultValue={toDateInput(vehicle?.registrationDate)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="registrationExpiry">Registration expires</Label>
            <Input
              id="registrationExpiry"
              name="registrationExpiry"
              type="date"
              defaultValue={toDateInput(vehicle?.registrationExpiry)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastServiceDate">Last service</Label>
            <Input
              id="lastServiceDate"
              name="lastServiceDate"
              type="date"
              defaultValue={toDateInput(vehicle?.lastServiceDate)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nextServiceDate">Next service due</Label>
            <Input
              id="nextServiceDate"
              name="nextServiceDate"
              type="date"
              defaultValue={toDateInput(vehicle?.nextServiceDate)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="serviceNotes">Service notes</Label>
          <Textarea
            id="serviceNotes"
            name="serviceNotes"
            rows={2}
            defaultValue={vehicle?.serviceNotes ?? ""}
            placeholder="Oil and filters replaced, brake fluid due next time"
          />
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={vehicle?.description}
          required
          minLength={10}
        />
      </div>

      {vehicle && vehicle.images.length > 0 && onDeleteImage && (
        <div className="space-y-2">
          <Label>Current images</Label>
          <div className="flex flex-wrap gap-3">
            {vehicle.images.map((image) => (
              <div key={image.id} className="group relative">
                <Image
                  src={image.url}
                  alt={`${vehicle.brand} ${vehicle.model}`}
                  width={128}
                  height={80}
                  className="h-20 w-32 rounded-md object-cover"
                />
                <button
                  type="button"
                  aria-label="Delete image"
                  className="absolute -top-2 -right-2 hidden h-6 w-6 rounded-full bg-red-600 text-xs text-white group-hover:block"
                  onClick={() =>
                    startTransition(async () => {
                      const result = await onDeleteImage(image.id);
                      if (result?.error) setError(result.error);
                    })
                  }
                >
                  X
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="images">
          {vehicle ? "Add images" : "Images"} (JPEG/PNG/WebP, max 5 MB each)
        </Label>
        <Input
          id="images"
          name="images"
          type="file"
          accept="image/*"
          multiple
        />
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <Button type="submit" variant="success" disabled={pending}>
        {pending ? "Saving..." : vehicle ? "Save changes" : "Create vehicle"}
      </Button>
    </form>
  );
}
