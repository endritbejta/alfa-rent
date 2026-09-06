"use client";

import { useCallback, useMemo, useState } from "react";
import {
  getReservationDetailAction,
  getVehicleDetailAction,
  getCustomerDetailAction,
  type ReservationDetail,
  type VehicleDetail,
  type CustomerDetail,
} from "./detail-actions";
import {
  DetailDrawerContext,
  type DetailDrawerHandle,
} from "@/components/dashboard/detail-drawer-context";
import { DetailDrawer } from "@/components/dashboard/detail-drawer";
import { ReservationBody } from "./reservation-body";
import { VehicleDetailBody } from "./vehicle-detail-body";
import { CustomerDetailBody } from "./customer-detail-body";
import { DrawerSkeleton } from "./detail-primitives";
import { vehicleLabel } from "@/lib/vehicle-label";
import { useI18n } from "@/components/shared/locale-provider";

type Loaded =
  | { kind: "reservation"; data: ReservationDetail }
  | { kind: "vehicle"; data: VehicleDetail }
  | { kind: "customer"; data: CustomerDetail };

export function ReservationDetailProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useI18n();
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

  const handle: DetailDrawerHandle = useMemo(
    () => ({ openReservation, openVehicle, openCustomer }),
    [openReservation, openVehicle, openCustomer]
  );

  const title =
    loaded?.kind === "reservation"
      ? `${loaded.data.customer.firstName} ${loaded.data.customer.lastName}`
      : loaded?.kind === "vehicle"
        ? `${loaded.data.vehicle.brand} ${loaded.data.vehicle.model}`
        : loaded?.kind === "customer"
          ? `${loaded.data.firstName} ${loaded.data.lastName}`
          : t("admin.details");

  const subtitle =
    loaded?.kind === "reservation"
      ? vehicleLabel(loaded.data.vehicle)
      : loaded?.kind === "vehicle"
        ? (loaded.data.vehicle.plate ?? String(loaded.data.vehicle.year))
        : loaded?.kind === "customer"
          ? loaded.data.email
          : undefined;

  return (
    <DetailDrawerContext.Provider value={handle}>
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
    </DetailDrawerContext.Provider>
  );
}
