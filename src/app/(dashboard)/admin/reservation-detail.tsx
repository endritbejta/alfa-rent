"use client";

import { createContext, useCallback, useContext, useState } from "react";
import Image from "next/image";
import { format } from "date-fns";
import {
  Mail,
  Phone,
  Car,
  CalendarRange,
  Receipt,
  ClipboardCheck,
} from "lucide-react";
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
import { ExtendReservation } from "./reservations/extend-reservation";
import { VehicleDetailBody } from "./vehicle-detail-body";
import { CustomerDetailBody } from "./customer-detail-body";
import { SectionTitle, Row, DrawerSkeleton } from "./detail-primitives";
import { vehicleLabel } from "@/utils/vehicle";
import { ReservationAttention } from "@/components/shared/reservation-attention";
import { InspectionAction } from "./reservations/inspection-action";

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
          <ReservationBody
            detail={loaded.data}
            onDone={() => setOpen(false)}
            // An extension rewrites the dates and total shown here, so the
            // drawer reloads in place rather than dismissing — the operator
            // stays on the record they just changed and sees the result.
            onChanged={() => openReservation(loaded.data.id)}
          />
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
  onChanged,
}: {
  detail: ReservationDetail;
  /** Completing a task here should feel finished — the drawer dismisses. */
  onDone: () => void;
  /** An edit that leaves the reservation open — reload, stay put. */
  onChanged: () => void;
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
            <span className="flex flex-wrap justify-end gap-1.5">
              <StatusBadge status={detail.status} />
              <ReservationAttention attention={detail.timing.attention} />
            </span>
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
          {detail.startedAt && (
            <Row label="Handover">
              {format(detail.startedAt, "dd MMM yyyy, HH:mm")}
            </Row>
          )}
          {detail.completedAt && (
            <Row label="Returned">
              {format(detail.completedAt, "dd MMM yyyy, HH:mm")}
            </Row>
          )}
          {detail.notes && (
            <p className="bg-secondary text-muted-foreground rounded-lg p-3 text-xs">
              {detail.notes}
            </p>
          )}
        </div>
        <ExtendReservation
          reservationId={detail.id}
          returnDate={detail.returnDate}
          pricePerDay={detail.vehicle.pricePerDay}
          extension={detail.extension}
          onExtended={onChanged}
        />

        <div className="mt-3">
          <div className="flex flex-wrap justify-end gap-2">
            <InspectionAction
              reservationId={detail.id}
              status={detail.status}
              timing={detail.timing}
              signerName={`${detail.customer.firstName} ${detail.customer.lastName}`}
              onSuccess={onChanged}
            />
            <StatusActions
              reservationId={detail.id}
              status={detail.status}
              onSuccess={onDone}
            />
          </div>
        </div>
      </section>

      {detail.inspections.length > 0 && (
        <section>
          <SectionTitle icon={ClipboardCheck}>
            Inspections ({detail.inspections.length})
          </SectionTitle>
          <div className="space-y-3">
            {detail.inspections.map((inspection) => (
              <article
                key={inspection.id}
                className="bg-secondary/60 rounded-xl border p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {inspection.type === "PICKUP"
                        ? "Pickup condition"
                        : "Return condition"}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {format(inspection.createdAt, "dd MMM yyyy, HH:mm")} by{" "}
                      {inspection.createdBy.name}
                    </p>
                  </div>
                  <span className="text-xs font-semibold tabular-nums">
                    {inspection.mileage.toLocaleString()} km ·{" "}
                    {inspection.fuelLevel}% fuel
                  </span>
                </div>

                {(inspection.exteriorNotes ||
                  inspection.interiorNotes ||
                  inspection.damageNotes) && (
                  <dl className="mt-3 space-y-1 text-xs">
                    {inspection.exteriorNotes && (
                      <div>
                        <dt className="text-muted-foreground inline">
                          Exterior:{" "}
                        </dt>
                        <dd className="inline">{inspection.exteriorNotes}</dd>
                      </div>
                    )}
                    {inspection.interiorNotes && (
                      <div>
                        <dt className="text-muted-foreground inline">
                          Interior:{" "}
                        </dt>
                        <dd className="inline">{inspection.interiorNotes}</dd>
                      </div>
                    )}
                    {inspection.damageNotes && (
                      <div>
                        <dt className="text-destructive inline font-semibold">
                          Damage:{" "}
                        </dt>
                        <dd className="inline">{inspection.damageNotes}</dd>
                      </div>
                    )}
                  </dl>
                )}

                {inspection.photos.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {inspection.photos.map((photo) => (
                      <div
                        key={photo.id}
                        className="relative aspect-square overflow-hidden rounded-lg bg-neutral-900"
                      >
                        <Image
                          src={photo.url}
                          alt={`${inspection.type.toLowerCase()} inspection`}
                          fill
                          sizes="8rem"
                          className="object-cover"
                        />
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-muted-foreground mt-3 border-t pt-2 text-[11px]">
                  Acknowledged by {inspection.signerName} at{" "}
                  {format(inspection.acknowledgedAt, "HH:mm")}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}

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
