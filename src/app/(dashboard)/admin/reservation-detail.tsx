"use client";

import { createContext, useCallback, useContext, useState } from "react";
import Image from "next/image";
import { format } from "date-fns";
import { Mail, Phone, Car, CalendarRange, Receipt } from "lucide-react";
import { getReservationDetailAction } from "./detail-actions";
import type { ReservationDetail } from "./detail-actions";
import { DetailDrawer } from "@/components/dashboard/detail-drawer";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatusActions } from "./reservations/status-actions";
import { vehicleLabel } from "@/utils/vehicle";

type Ctx = { openReservation: (id: string) => void };
const DetailContext = createContext<Ctx>({ openReservation: () => {} });

/** Any widget can call this to open the shared reservation drawer. */
export const useReservationDetail = () => useContext(DetailContext);

export function ReservationDetailProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [detail, setDetail] = useState<ReservationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const openReservation = useCallback(async (id: string) => {
    setOpen(true);
    setLoading(true);
    const result = await getReservationDetailAction(id);
    setDetail("error" in result ? null : result.data);
    setLoading(false);
  }, []);

  return (
    <DetailContext.Provider value={{ openReservation }}>
      {children}
      <DetailDrawer
        open={open}
        onClose={() => setOpen(false)}
        title={
          detail
            ? `${detail.customer.firstName} ${detail.customer.lastName}`
            : "Reservation"
        }
        subtitle={detail ? vehicleLabel(detail.vehicle) : undefined}
      >
        {loading && !detail && <DrawerSkeleton />}
        {detail && <ReservationBody detail={detail} />}
      </DetailDrawer>
    </DetailContext.Provider>
  );
}

function DrawerSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="bg-secondary h-16 animate-pulse rounded-lg" />
      ))}
    </div>
  );
}

const eur = (v: unknown) => `${Number(v).toFixed(2)} EUR`;

function ReservationBody({ detail }: { detail: ReservationDetail }) {
  const cover = detail.vehicle.images[0];
  const history = detail.customer.reservations;
  const spend = history
    .filter((r) => r.status === "ACTIVE" || r.status === "COMPLETED")
    .reduce((sum, r) => sum + Number(r.totalPrice), 0);

  return (
    <div className="space-y-6">
      {/* Vehicle */}
      <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-gradient-to-br from-neutral-800 to-neutral-900">
        {cover ? (
          <Image
            src={cover.url}
            alt={vehicleLabel(detail.vehicle)}
            fill
            sizes="26rem"
            className="object-cover"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-xs tracking-[0.14em] text-neutral-500 uppercase">
            {detail.vehicle.brand}
          </span>
        )}
        <span className="absolute top-3 right-3">
          <StatusBadge status={detail.vehicle.status} />
        </span>
      </div>

      {/* This reservation */}
      <section>
        <SectionTitle icon={CalendarRange}>This reservation</SectionTitle>
        <div className="space-y-2 text-sm">
          <Row label="Status">
            <StatusBadge status={detail.status} />
          </Row>
          <Row label="Pickup">
            {format(detail.pickupDate, "EEE dd MMM yyyy")}
          </Row>
          <Row label="Return">
            {format(detail.returnDate, "EEE dd MMM yyyy")}
          </Row>
          <Row label="Total">
            <span className="font-display font-bold">
              {eur(detail.totalPrice)}
            </span>
          </Row>
          <Row label="Payment">
            <span className="text-muted-foreground">
              {detail.status === "COMPLETED"
                ? "Settled at return"
                : "Due at pickup"}
            </span>
          </Row>
          <Row label="Booked">{format(detail.createdAt, "dd MMM yyyy")}</Row>
          {detail.notes && (
            <p className="bg-secondary text-muted-foreground rounded-lg p-3 text-xs">
              {detail.notes}
            </p>
          )}
        </div>
        <div className="mt-3">
          <StatusActions reservationId={detail.id} status={detail.status} />
        </div>
      </section>

      {/* Customer */}
      <section>
        <SectionTitle icon={Mail}>Customer</SectionTitle>
        <div className="space-y-2 text-sm">
          <Row label="Name">
            {detail.customer.firstName} {detail.customer.lastName}
          </Row>
          <Row label="Email">
            <span className="truncate">{detail.customer.email}</span>
          </Row>
          <Row label="Phone">
            <span className="flex items-center gap-1.5">
              <Phone className="text-muted-foreground h-3 w-3" />
              {detail.customer.phone}
            </span>
          </Row>
          <Row label="Customer since">
            {format(detail.customer.createdAt, "MMM yyyy")}
          </Row>
          <Row label="Lifetime spend">
            <span className="font-semibold">{spend.toFixed(2)} EUR</span>
          </Row>
          {detail.customer.notes && (
            <p className="bg-secondary text-muted-foreground rounded-lg p-3 text-xs">
              {detail.customer.notes}
            </p>
          )}
        </div>
      </section>

      {/* Vehicle facts */}
      <section>
        <SectionTitle icon={Car}>Vehicle</SectionTitle>
        <div className="space-y-2 text-sm">
          <Row label="Category">
            {detail.vehicle.category.charAt(0) +
              detail.vehicle.category.slice(1).toLowerCase()}
          </Row>
          <Row label="Specs">
            {detail.vehicle.transmission === "AUTOMATIC"
              ? "Automatic"
              : "Manual"}{" "}
            -{" "}
            {detail.vehicle.fuelType.charAt(0) +
              detail.vehicle.fuelType.slice(1).toLowerCase()}{" "}
            - {detail.vehicle.seats} seats
          </Row>
          <Row label="Day rate">{eur(detail.vehicle.pricePerDay)}</Row>
          {detail.vehicle.registrationExpiry && (
            <Row label="Registration">
              {format(detail.vehicle.registrationExpiry, "dd MMM yyyy")}
            </Row>
          )}
        </div>
      </section>

      {/* History */}
      <section>
        <SectionTitle icon={Receipt}>
          Reservation history ({history.length})
        </SectionTitle>
        <ul className="divide-y">
          {history.map((r) => (
            <li key={r.id} className="flex items-center gap-2 py-2 text-xs">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {vehicleLabel(r.vehicle)}
                </p>
                <p className="text-muted-foreground">
                  {format(r.pickupDate, "dd MMM")} -{" "}
                  {format(r.returnDate, "dd MMM yyyy")}
                </p>
              </div>
              <span className="tabular-nums">{eur(r.totalPrice)}</span>
              <StatusBadge status={r.status} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <h3 className="text-muted-foreground mb-2.5 flex items-center gap-1.5 text-[11px] font-bold tracking-[0.1em] uppercase">
      <Icon className="text-brand h-3.5 w-3.5" />
      {children}
    </h3>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground shrink-0 text-xs">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}
