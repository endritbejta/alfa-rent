"use client";

import Image from "next/image";
import Link from "next/link";
import { format } from "date-fns";
import { enUS, sq } from "date-fns/locale";
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
import { useI18n } from "@/components/shared/locale-provider";
import { formatEur } from "@/lib/money";

const REG_TONE = {
  expired: "text-destructive",
  due: "text-status-maint",
  ok: "text-status-available",
  unknown: "text-muted-foreground",
} as const;

export function VehicleDetailBody({ detail }: { detail: VehicleDetail }) {
  const { locale, t } = useI18n();
  const dateLocale = locale === "sq" ? sq : enUS;
  // Whole euros: these are running totals on compact metric tiles.
  const eur = (n: number) => formatEur(n, locale, { precision: 0 });
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
            <span className="text-media-foreground absolute inset-0 flex items-center justify-center text-xs tracking-[0.14em] uppercase">
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
                className="bg-media relative aspect-[16/10] overflow-hidden rounded-md"
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
            {t("admin.noPhotos")}
          </p>
        )}
      </div>

      {/* Cost overview — the reason this drawer exists */}
      <section>
        <SectionTitle icon={Coins}>{t("admin.costOverview")}</SectionTitle>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <Metric label={t("admin.totalSpend")} value={eur(costs.total)} />
          <Metric label={t("admin.earned")} value={eur(costs.earned)} />
          <Metric
            label={t("admin.perYear")}
            value={eur(costs.perYear)}
            hint={t("admin.runningAverage")}
          />
          <Metric
            label={t("admin.net")}
            value={eur(costs.net)}
            tone={costs.net >= 0 ? "good" : "bad"}
          />
        </div>
        <div className="space-y-2 text-sm">
          <Row label={t("admin.registration")}>{eur(costs.registration)}</Row>
          <Row label={t("admin.servicing")}>{eur(costs.service)}</Row>
          <Row label={t("admin.repairs", { count: costs.repairCount })}>
            {eur(costs.repairs)}
          </Row>
          <Row label={t("admin.repairsYear")}>{eur(costs.repairsThisYear)}</Row>
          <Row label={t("admin.perMonth")}>{eur(costs.perMonth)}</Row>
        </div>
      </section>

      {/* Legal */}
      <section>
        <SectionTitle icon={ShieldCheck}>
          {t("admin.registration")}
        </SectionTitle>
        <div className="space-y-2 text-sm">
          <Row label={t("admin.plate")}>
            <span className="font-mono">
              {vehicle.plate ?? t("admin.notSet")}
            </span>
          </Row>
          <Row label={t("admin.registered")}>
            {vehicle.registrationDate
              ? format(vehicle.registrationDate, "dd MMM yyyy", {
                  locale: dateLocale,
                })
              : t("admin.notSet")}
          </Row>
          <Row label={t("admin.expires")}>
            <span className={REG_TONE[registration.state]}>
              {vehicle.registrationExpiry
                ? format(vehicle.registrationExpiry, "dd MMM yyyy", {
                    locale: dateLocale,
                  })
                : t("admin.notSet")}
              {registration.daysLeft !== null &&
                (registration.state === "expired"
                  ? ` (${t("admin.daysOverdue", {
                      count: Math.abs(registration.daysLeft),
                    })})`
                  : registration.state === "due"
                    ? ` (${t("admin.daysLeft", {
                        count: registration.daysLeft,
                      })})`
                    : "")}
            </span>
          </Row>
        </div>
      </section>

      {/* Maintenance */}
      <section>
        <SectionTitle icon={Wrench}>{t("admin.maintenance")}</SectionTitle>
        <div className="space-y-2 text-sm">
          <Row label={t("admin.lastService")}>
            {vehicle.lastServiceDate
              ? format(vehicle.lastServiceDate, "dd MMM yyyy", {
                  locale: dateLocale,
                })
              : t("admin.notSet")}
          </Row>
          <Row label={t("admin.nextDue")}>
            {vehicle.nextServiceDate
              ? format(vehicle.nextServiceDate, "dd MMM yyyy", {
                  locale: dateLocale,
                })
              : t("admin.notSet")}
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
                    {format(r.date, "dd MMM yyyy", { locale: dateLocale })}
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
          {t("common.reservations")} ({vehicle.reservations.length})
        </SectionTitle>
        {active && (
          <p className="bg-status-rented/10 text-status-rented mb-2 rounded-lg px-3 py-2 text-xs font-semibold">
            {t("admin.outNow", {
              name: `${active.customer.firstName} ${active.customer.lastName}`,
              date: format(active.returnDate, "dd MMM", { locale: dateLocale }),
            })}
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
                  {format(r.pickupDate, "dd MMM", { locale: dateLocale })} -{" "}
                  {format(r.returnDate, "dd MMM yyyy", {
                    locale: dateLocale,
                  })}
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
        {t("admin.editVehicleRepairs")}
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
