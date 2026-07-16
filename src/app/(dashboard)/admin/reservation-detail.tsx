"use client";

import { createContext, useCallback, useContext, useState } from "react";
import Image from "next/image";
import { format } from "date-fns";
import { Mail, Phone, Car, CalendarRange, Receipt } from "lucide-react";
import {
  getReservationDetailAction,
  getVehicleDetailAction,
  getCustomerDetailAction,
  type ReservationDetail,
  type VehicleDetail,
  type CustomerDetail,
} from "./detail-actions";
import { DetailDrawer } from "@/components/dashboard/detail-drawer";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatusActions } from "./reservations/status-actions";
import { VehicleDetailBody } from "./vehicle-detail-body";
import { CustomerDetailBody } from "./customer-detail-body";
import { SectionTitle, Row, DrawerSkeleton } from "./detail-primitives";
import { vehicleLabel } from "@/utils/vehicle";

type Loaded =
  | { kind: "reservation"; data: ReservationDetail }
  | { kind: "vehicle"; data: VehicleDetail }
  | { kind: "customer"; data: CustomerDetail };

type Ctx = {
  openReservation: (id: string) => void;
  openVehicle: (id: string) => void;
  openCustomer: (id: string) => void;
};

const DetailContext = createContext<Ctx>({
  openReservation: () => {},
  openVehicle: () => {},
  openCustomer: () => {},
});

/**
 * One drawer for the whole admin. Widgets call open*(id) and the payload
 * is fetched on demand, so summary lists stay light and no screen has to
 * navigate away to show detail.
 */
export const useReservationDetail = () => useContext(DetailContext);
export const useDetailDrawer = () => useContext(DetailContext);

export function ReservationDetailProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async <T,>(
      kind: Loaded["kind"],
      fetcher: () => Promise<{ data: T } | { error: string }>
    ) => {
      setOpen(true);
      setLoading(true);
      setError(null);
      setLoaded(null);
      const result = await fetcher();
      if ("error" in result) setError(result.error);
      else setLoaded({ kind, data: result.data } as Loaded);
      setLoading(false);
    },
    []
  );

  const openReservation = useCallback(
    (id: string) => {
      void load("reservation", () => getReservationDetailAction(id));
    },
    [load]
  );
  const openVehicle = useCallback(
    (id: string) => {
      void load("vehicle", () => getVehicleDetailAction(id));
    },
    [load]
  );
  const openCustomer = useCallback(
    (id: string) => {
      void load("customer", () => getCustomerDetailAction(id));
    },
    [load]
  );

  const title =
    loaded?.kind === "reservation"
      ? `${loaded.data.customer.firstName} ${loaded.data.customer.lastName}`
      : loaded?.kind === "vehicle"
        ? `${loaded.data.vehicle.brand} ${loaded.data.vehicle.model}`
        : loaded?.kind === "customer"
          ? `${loaded.data.firstName} ${loaded.data.lastName}`
          : "Details";

  const subtitle =
    loaded?.kind === "reservation"
      ? vehicleLabel(loaded.data.vehicle)
      : loaded?.kind === "vehicle"
        ? (loaded.data.vehicle.plate ?? String(loaded.data.vehicle.year))
        : loaded?.kind === "customer"
          ? loaded.data.email
          : undefined;

  return (
    <DetailContext.Provider
      value={{ openReservation, openVehicle, openCustomer }}
    >
      {children}
      <DetailDrawer
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        subtitle={subtitle}
      >
        {loading && <DrawerSkeleton />}
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        {loaded?.kind === "reservation" && (
          <ReservationBody detail={loaded.data} onDone={() => setOpen(false)} />
        )}
        {loaded?.kind === "vehicle" && (
          <VehicleDetailBody detail={loaded.data} />
        )}
        {loaded?.kind === "customer" && (
          <CustomerDetailBody detail={loaded.data} />
        )}
      </DetailDrawer>
    </DetailContext.Provider>
  );
}

const eur = (v: unknown) => `${Number(v).toFixed(2)} EUR`;

function ReservationBody({
  detail,
  onDone,
}: {
  detail: ReservationDetail;
  /** Completing a task here should feel finished — the drawer dismisses. */
  onDone: () => void;
}) {
  const cover = detail.vehicle.images[0];
  const history = detail.customer.reservations;
  const spend = history
    .filter((r) => r.status === "ACTIVE" || r.status === "COMPLETED")
    .reduce((sum, r) => sum + Number(r.totalPrice), 0);

  return (
    <div className="space-y-6">
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
          <StatusActions
            reservationId={detail.id}
            status={detail.status}
            onSuccess={onDone}
          />
        </div>
      </section>

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

      <section>
        <SectionTitle icon={Car}>Vehicle</SectionTitle>
        <div className="space-y-2 text-sm">
          <Row label="Category">
            {detail.vehicle.category.charAt(0) +
              detail.vehicle.category.slice(1).toLowerCase()}
          </Row>
          <Row label="Day rate">{eur(detail.vehicle.pricePerDay)}</Row>
          {detail.vehicle.registrationExpiry && (
            <Row label="Registration">
              {format(detail.vehicle.registrationExpiry, "dd MMM yyyy")}
            </Row>
          )}
        </div>
      </section>

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
