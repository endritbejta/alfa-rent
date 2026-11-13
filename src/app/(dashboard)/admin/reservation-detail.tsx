"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  getReservationDetailAction,
  getVehicleDetailAction,
  getCustomerDetailAction,
  type ReservationDetail,
  type VehicleDetail,
  type CustomerDetail,
} from "./detail-actions";
import {
  readDrawerTarget,
  withDrawerTarget,
  withoutDrawerTarget,
  type DrawerKind,
} from "./drawer-url";
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
import { reportError } from "@/lib/observability";
import { PendingStatus } from "@/components/shared/pending-status";

/** Marks a history entry the drawer pushed, so closing knows to pop it. */
const DRAWER_ENTRY = "alfaDrawer";

/**
 * Which record is loaded, tagged with the request that asked for it. Keying
 * the payload rather than tracking a separate `loading` flag means the drawer
 * cannot show one reservation's body under another's heading when two opens
 * land out of order, and there is no state to set synchronously in an effect.
 */
type Loaded =
  | { key: string; kind: "reservation"; data: ReservationDetail }
  | { key: string; kind: "vehicle"; data: VehicleDetail }
  | { key: string; kind: "customer"; data: CustomerDetail };

async function fetchDetail(
  key: string,
  kind: DrawerKind,
  id: string
): Promise<Loaded | { error: string }> {
  switch (kind) {
    case "reservation": {
      const result = await getReservationDetailAction(id);
      return "error" in result ? result : { key, kind, data: result.data };
    }
    case "vehicle": {
      const result = await getVehicleDetailAction(id);
      return "error" in result ? result : { key, kind, data: result.data };
    }
    case "customer": {
      const result = await getCustomerDetailAction(id);
      return "error" in result ? result : { key, kind, data: result.data };
    }
  }
}

export function ReservationDetailProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const target = readDrawerTarget(searchParams);

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // `message: undefined` is a request that never came back with an answer at
  // all — the action rejected rather than returning one.
  const [failure, setFailure] = useState<{
    key: string;
    message?: string;
  } | null>(null);
  // Bumped to re-fetch the record already on screen without touching the URL.
  const [reloads, setReloads] = useState(0);
  /*
   * Every record opened this session, by kind and id: stale-while-revalidate.
   * Reopening one shows it at once while a fresh copy loads, instead of the
   * skeleton every time — staff flip between the same few bookings all day.
   * Memory only, never storage, so it goes with a reload or a sign-out.
   */
  const [seen, setSeen] = useState<Record<string, Loaded>>({});

  const kind = target?.kind ?? null;
  const id = target?.id ?? null;
  const requestKey = kind && id ? `${kind}:${id}:${reloads}` : null;

  useEffect(() => {
    if (!kind || !id || !requestKey) return;
    let cancelled = false;
    void fetchDetail(requestKey, kind, id)
      .then((result) => {
        if (cancelled) return;
        if ("error" in result) {
          setFailure({ key: requestKey, message: result.error });
        } else {
          setLoaded(result);
          setSeen((current) => ({ ...current, [`${kind}:${id}`]: result }));
        }
      })
      /*
       * The detail actions call requireUser() outside their try, so an
       * expired session rejects the action rather than returning an error.
       * Without this the promise was simply dropped and the drawer sat on its
       * skeleton for as long as the operator was willing to wait.
       */
      .catch((cause: unknown) => {
        if (cancelled) return;
        reportError(cause, { scope: "detail-drawer", kind, id });
        setFailure({ key: requestKey });
      });
    return () => {
      cancelled = true;
    };
  }, [kind, id, requestKey]);

  /*
   * pushState rather than router.push. The filters and pagination navigate
   * because the server renders their result; the drawer's payload comes from
   * a server action, so a navigation would re-render the whole admin page to
   * change nothing. Next syncs useSearchParams with the History API, so the
   * URL is still the state and Back still works.
   *
   * The drawer is one layer over the page, never a stack: opening a record
   * from inside an open drawer swaps the entry in place, so Back and Close
   * both always land on the page underneath.
   */
  const openDetail = useCallback((kind: DrawerKind, id: string) => {
    const url = `?${withDrawerTarget(window.location.search, { kind, id })}`;
    // Fresh state objects only: Next skips syncing useSearchParams for any
    // state that already carries its own internal flag, so handing the
    // current entry's state back would leave the drawer showing the old record.
    if (readDrawerTarget(new URLSearchParams(window.location.search))) {
      const pushed = Boolean(window.history.state?.[DRAWER_ENTRY]);
      window.history.replaceState(
        pushed ? { [DRAWER_ENTRY]: true } : null,
        "",
        url
      );
    } else {
      window.history.pushState({ [DRAWER_ENTRY]: true }, "", url);
    }
  }, []);

  /*
   * Closing pops the entry the drawer pushed. It used to overwrite it with
   * the list's URL instead, which left the list in history twice: the next
   * Back appeared to do nothing, and the one after jumped two pages. A drawer
   * opened from a link — a bookmark, a colleague's URL — has no entry of its
   * own to pop, and only that case still rewrites the URL in place.
   */
  const close = useCallback(() => {
    if (window.history.state?.[DRAWER_ENTRY]) {
      window.history.back();
      return;
    }
    const query = withoutDrawerTarget(window.location.search);
    window.history.replaceState(
      null,
      "",
      query ? `?${query}` : window.location.pathname
    );
  }, []);

  const handle = useMemo<DetailDrawerHandle>(
    () => ({
      openReservation: (id) => openDetail("reservation", id),
      openVehicle: (id) => openDetail("vehicle", id),
      openCustomer: (id) => openDetail("customer", id),
    }),
    [openDetail]
  );

  // While closing, the panel stays mounted for its exit animation — so the
  // last record keeps rendering rather than blanking on the way out.
  const fresh = !target || loaded?.key === requestKey ? loaded : null;
  const message =
    failure?.key === requestKey
      ? (failure.message ?? t("admin.detailUnavailable"))
      : null;
  // The copy from last time stands in until the fresh one lands — but not
  // over an error, which has to be read.
  const stale =
    !fresh && !message && kind && id ? (seen[`${kind}:${id}`] ?? null) : null;
  const body = fresh ?? stale;
  const revalidating = stale !== null;
  const loading = requestKey !== null && !body && !message;

  const title =
    body?.kind === "reservation"
      ? `${body.data.customer.firstName} ${body.data.customer.lastName}`
      : body?.kind === "vehicle"
        ? `${body.data.vehicle.brand} ${body.data.vehicle.model}`
        : body?.kind === "customer"
          ? body.data.anonymisedAt
            ? t("admin.anonymisedName")
            : `${body.data.firstName} ${body.data.lastName}`
          : t("admin.details");

  const subtitle =
    body?.kind === "reservation"
      ? vehicleLabel(body.data.vehicle)
      : body?.kind === "vehicle"
        ? (body.data.vehicle.plate ?? String(body.data.vehicle.year))
        : body?.kind === "customer"
          ? body.data.anonymisedAt
            ? undefined
            : body.data.email
          : undefined;

  return (
    <DetailDrawerContext.Provider value={handle}>
      {children}
      <DetailDrawer
        open={target !== null}
        onClose={close}
        // Once it is off screen the record is history: reopening it goes
        // through the stale-while-revalidate path like any other, rather
        // than passing last time's copy off as fresh.
        onClosed={() => setLoaded(null)}
        title={title}
        subtitle={subtitle}
      >
        {loading && kind && <DrawerSkeleton kind={kind} />}
        {message && (
          <p role="alert" className="text-destructive text-sm">
            {message}
          </p>
        )}
        {/* A stale copy can be read but not acted on: until the fresh one
            arrives its buttons might confirm a booking a colleague already
            cancelled. The bar only shows if the refresh is slow enough to
            notice. */}
        <PendingStatus message={revalidating ? t("admin.refreshing") : null} />
        {revalidating && (
          <div
            aria-hidden="true"
            className="bg-brand/70 -mt-5 mb-4 -ml-5 h-0.5 w-[calc(100%+2.5rem)] origin-left animate-[refresh-bar_1.2s_var(--ease-standard)_400ms_infinite_both] motion-reduce:animate-none motion-reduce:opacity-60"
          />
        )}
        <div inert={revalidating} aria-busy={revalidating || undefined}>
          {body?.kind === "reservation" && (
            <ReservationBody
              detail={body.data}
              onDone={close}
              // An extension rewrites the dates and total shown here, so the
              // drawer reloads in place rather than dismissing — the operator
              // stays on the record they just changed and sees the result.
              onChanged={() => setReloads((n) => n + 1)}
            />
          )}
          {body?.kind === "vehicle" && (
            <VehicleDetailBody
              detail={body.data}
              // A service changes the cost figures above it: reload in place.
              onChanged={() => setReloads((n) => n + 1)}
            />
          )}
          {body?.kind === "customer" && (
            <CustomerDetailBody
              detail={body.data}
              onChanged={() => setReloads((n) => n + 1)}
            />
          )}
        </div>
      </DetailDrawer>
    </DetailDrawerContext.Provider>
  );
}
