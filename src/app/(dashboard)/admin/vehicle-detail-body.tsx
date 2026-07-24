"use client";

import Image from "next/image";
import Link from "next/link";
import { format } from "date-fns";
import {
  Coins,
  ShieldCheck,
  Wrench,
  CalendarRange,
  Images,
} from "lucide-react";
import type { VehicleDetail } from "./detail-actions";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { SectionTitle, Row } from "./detail-primitives";

const eur = (n: number) =>
  `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })} EUR`;

const REG_TONE = {
  expired: "text-destructive",
  due: "text-status-maint",
  ok: "text-status-available",
  unknown: "text-muted-foreground",
} as const;

export function VehicleDetailBody({ detail }: { detail: VehicleDetail }) {
  const { vehicle, registration, costs } = detail;
  const [cover, ...rest] = vehicle.images;
  const active = vehicle.reservations.find((r) => r.status === "ACTIVE");

  return (
    <div className="space-y-6">
      {/* Gallery */}
      <div>
        <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-gradient-to-br from-neutral-800 to-neutral-900">
          {cover ? (
            <Image
              src={cover.url}
              alt={`${vehicle.brand} ${vehicle.model}`}
              fill
              sizes="26rem"
              className="object-cover"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-xs tracking-[0.14em] text-neutral-500 uppercase">
              {vehicle.brand}
            </span>
          )}
          <span className="absolute top-3 right-3">
            <StatusBadge status={vehicle.status} variant="overlay" />
          </span>
        </div>
        {rest.length > 0 && (
          <div className="mt-2 grid grid-cols-4 gap-2">
            {rest.slice(0, 4).map((img) => (
              <div
                key={img.id}
                className="relative aspect-[16/10] overflow-hidden rounded-md bg-neutral-900"
              >
                <Image
                  src={img.url}
                  alt=""
                  fill
                  sizes="6rem"
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        )}
        {vehicle.images.length === 0 && (
          <p className="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs">
            <Images className="h-3.5 w-3.5" />
            No photos uploaded yet
          </p>
        )}
      </div>

      {/* Cost overview — the reason this drawer exists */}
      <section>
        <SectionTitle icon={Coins}>Cost overview</SectionTitle>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <Metric label="Total spend" value={eur(costs.total)} />
          <Metric label="Earned" value={eur(costs.earned)} />
          <Metric
            label="Per year"
            value={eur(costs.perYear)}
            hint="running average"
          />
          <Metric
            label="Net"
            value={eur(costs.net)}
            tone={costs.net >= 0 ? "good" : "bad"}
          />
        </div>
        <div className="space-y-2 text-sm">
          <Row label="Registration">{eur(costs.registration)}</Row>
          <Row label="Servicing">{eur(costs.service)}</Row>
          <Row label={`Repairs (${costs.repairCount})`}>
            {eur(costs.repairs)}
          </Row>
          <Row label="Repairs this year">{eur(costs.repairsThisYear)}</Row>
          <Row label="Per month">{eur(costs.perMonth)}</Row>
        </div>
      </section>

      {/* Legal */}
      <section>
        <SectionTitle icon={ShieldCheck}>Registration</SectionTitle>
        <div className="space-y-2 text-sm">
          <Row label="Plate">
            <span className="font-mono">{vehicle.plate ?? "Not set"}</span>
          </Row>
          <Row label="Registered">
            {vehicle.registrationDate
              ? format(vehicle.registrationDate, "dd MMM yyyy")
              : "Not set"}
          </Row>
          <Row label="Expires">
            <span className={REG_TONE[registration.state]}>
              {vehicle.registrationExpiry
                ? format(vehicle.registrationExpiry, "dd MMM yyyy")
                : "Not set"}
              {registration.daysLeft !== null &&
                (registration.state === "expired"
                  ? ` (${Math.abs(registration.daysLeft)}d overdue)`
                  : registration.state === "due"
                    ? ` (${registration.daysLeft}d left)`
                    : "")}
            </span>
          </Row>
        </div>
      </section>

      {/* Maintenance */}
      <section>
        <SectionTitle icon={Wrench}>Maintenance</SectionTitle>
        <div className="space-y-2 text-sm">
          <Row label="Last service">
            {vehicle.lastServiceDate
              ? format(vehicle.lastServiceDate, "dd MMM yyyy")
              : "Not set"}
          </Row>
          <Row label="Next due">
            {vehicle.nextServiceDate
              ? format(vehicle.nextServiceDate, "dd MMM yyyy")
              : "Not set"}
          </Row>
        </div>
        {vehicle.serviceNotes && (
          <p className="bg-secondary text-muted-foreground mt-2 rounded-lg p-3 text-xs">
            {vehicle.serviceNotes}
          </p>
        )}
        {vehicle.repairs.length > 0 && (
          <ul className="mt-3 divide-y">
            {vehicle.repairs.slice(0, 5).map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 py-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.description}</p>
                  <p className="text-muted-foreground">
                    {format(r.date, "dd MMM yyyy")}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums">
                  {eur(Number(r.cost))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Availability */}
      <section>
        <SectionTitle icon={CalendarRange}>
          Reservations ({vehicle.reservations.length})
        </SectionTitle>
        {active && (
          <p className="bg-status-rented/10 text-status-rented mb-2 rounded-lg px-3 py-2 text-xs font-semibold">
            Out now with {active.customer.firstName} {active.customer.lastName}{" "}
            until {format(active.returnDate, "dd MMM")}
          </p>
        )}
        <ul className="divide-y">
          {vehicle.reservations.map((r) => (
            <li key={r.id} className="flex items-center gap-2 py-2 text-xs">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {r.customer.firstName} {r.customer.lastName}
                </p>
                <p className="text-muted-foreground">
                  {format(r.pickupDate, "dd MMM")} -{" "}
                  {format(r.returnDate, "dd MMM yyyy")}
                </p>
              </div>
              <StatusBadge status={r.status} />
            </li>
          ))}
        </ul>
      </section>

      <Button
        variant="outline"
        className="w-full"
        nativeButton={false}
        render={<Link href={`/admin/vehicles/${vehicle.id}/edit`} />}
      >
        Edit vehicle and repairs
      </Button>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="bg-secondary rounded-lg border p-3">
      <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.08em] uppercase">
        {label}
      </p>
      <p
        className={
          tone === "good"
            ? "font-display text-status-available mt-0.5 text-base font-bold tabular-nums"
            : tone === "bad"
              ? "font-display text-destructive mt-0.5 text-base font-bold tabular-nums"
              : "font-display mt-0.5 text-base font-bold tabular-nums"
        }
      >
        {value}
      </p>
      {hint && <p className="text-muted-foreground text-[10px]">{hint}</p>}
    </div>
  );
}
