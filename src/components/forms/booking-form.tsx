"use client";

import { useState } from "react";
import Link from "next/link";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
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

const formSchema = z
  .object({
    vehicleId: z.string().min(1, "Choose a vehicle"),
    from: z.string().min(1, "Pickup date is required"),
    to: z.string().min(1, "Return date is required"),
    firstName: z.string().trim().min(1, "Required").max(50),
    lastName: z.string().trim().min(1, "Required").max(50),
    email: z.email("Enter a valid email"),
    phone: z.string().trim().min(6, "Enter a valid phone number").max(25),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine((d) => !d.from || !d.to || d.to > d.from, {
    message: "Return must be after pickup",
    path: ["to"],
  });

type FormValues = z.infer<typeof formSchema>;

type VehicleOption = { id: string; slug: string; label: string };

type Confirmation = { id: string; totalPrice: number };

export function BookingForm({
  vehicles,
  preselectedSlug,
  initialFrom,
  initialTo,
}: {
  vehicles: VehicleOption[];
  preselectedSlug?: string;
  initialFrom?: string;
  initialTo?: string;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  // Local midnight, not UTC: the old `toISOString()` bound made "today"
  // yesterday for anyone whose local date was already ahead of UTC.
  const now = new Date();
  const minDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const preselected = vehicles.find((v) => v.slug === preselectedSlug);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      vehicleId: preselected?.id ?? "",
      from: initialFrom ?? "",
      to: initialTo ?? "",
    },
  });

  /** useWatch, not watch(): the latter cannot be memoized safely. */
  const pickedFrom = useWatch({ control, name: "from" });

  const onSubmit = async (data: FormValues) => {
    setServerError(null);
    const res = await fetch("/api/bookings", {
      method: "POST",
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
    const json: ApiResponse<Confirmation> = await res.json();
    if (!json.success) {
      setServerError(json.error.message);
      return;
    }
    setConfirmation(json.data);
  };

  if (confirmation) {
    return (
      <div className="rounded-2xl border p-8 text-center">
        <CheckCircle2 className="text-status-available mx-auto h-12 w-12" />
        <h2 className="font-display mt-4 text-2xl font-bold">
          Request received
        </h2>
        <p className="text-muted-foreground mx-auto mt-3 max-w-md text-sm leading-relaxed">
          Your booking total is{" "}
          <strong className="text-foreground">
            {confirmation.totalPrice} EUR
          </strong>
          . Our team will confirm by email within business hours — nothing is
          charged until pickup.
        </p>
        <p className="text-muted-foreground mt-2 font-mono text-xs">
          Reference: {confirmation.id}
        </p>
        <Button
          className="mt-6"
          variant="outline"
          nativeButton={false}
          render={<Link href="/car" />}
        >
          Back to the fleet
        </Button>
      </div>
    );
  }

  const err = (message?: string) =>
    message ? <p className="text-destructive text-sm">{message}</p> : null;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <div className="space-y-2">
        <Label htmlFor="vehicleId">Vehicle</Label>
        <select
          id="vehicleId"
          {...register("vehicleId")}
          className="border-input focus:ring-ring h-10 w-full rounded-lg border bg-transparent px-3 text-sm outline-none focus:ring-2"
        >
          <option value="">Choose a vehicle</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
        {err(errors.vehicleId?.message)}
      </div>

      {/* Controller, not register: the picker is a button, not an input.
          The field value stays the same "yyyy-MM-dd" string the schema
          compares lexicographically, so validation is untouched. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="from">Pickup date</Label>
          <Controller
            control={control}
            name="from"
            render={({ field }) => (
              <DatePicker
                id="from"
                value={fromDateValue(field.value)}
                onChange={(date) =>
                  field.onChange(date ? toDateValue(date) : "")
                }
                minDate={minDate}
                placeholder="Pickup date"
              />
            )}
          />
          {err(errors.from?.message)}
        </div>
        <div className="space-y-2">
          <Label htmlFor="to">Return date</Label>
          <Controller
            control={control}
            name="to"
            render={({ field }) => (
              <DatePicker
                id="to"
                value={fromDateValue(field.value)}
                onChange={(date) =>
                  field.onChange(date ? toDateValue(date) : "")
                }
                // A return before the pickup is not a validation message
                // worth writing — it is simply not offered.
                minDate={fromDateValue(pickedFrom) ?? minDate}
                placeholder="Return date"
              />
            )}
          />
          {err(errors.to?.message)}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            autoComplete="given-name"
            {...register("firstName")}
          />
          {err(errors.firstName?.message)}
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input
            id="lastName"
            autoComplete="family-name"
            {...register("lastName")}
          />
          {err(errors.lastName?.message)}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            {...register("email")}
          />
          {err(errors.email?.message)}
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+383 44 ..."
            {...register("phone")}
          />
          {err(errors.phone?.message)}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea
          id="notes"
          rows={3}
          placeholder="Airport pickup, child seat, anything we should know"
          {...register("notes")}
        />
      </div>

      {serverError && (
        <p role="alert" className="text-destructive text-sm">
          {serverError}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Sending request..." : "Send booking request"}
      </Button>
      <p className="text-muted-foreground text-center text-xs">
        No payment now. Our team confirms availability and meets you at pickup.
      </p>
    </form>
  );
}
