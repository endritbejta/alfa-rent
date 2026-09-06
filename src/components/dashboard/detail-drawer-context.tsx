"use client";

import { createContext, useContext } from "react";

/**
 * One drawer for the whole admin. Widgets call open*(id) and the payload is
 * fetched on demand, so summary lists stay light and no screen has to
 * navigate away to show detail.
 *
 * The context lives here, apart from the provider, because the widgets that
 * open the drawer are spread across every admin route and two of them sit in
 * this folder. Exporting it from the route module that renders the drawer
 * pointed the dependency backwards — a shared component could not be moved
 * or read without the admin's 466-line detail file coming with it.
 */
export type DetailDrawerHandle = {
  openReservation: (id: string) => void;
  openVehicle: (id: string) => void;
  openCustomer: (id: string) => void;
};

export const DetailDrawerContext = createContext<DetailDrawerHandle | null>(
  null
);

export function useDetailDrawer(): DetailDrawerHandle {
  const handle = useContext(DetailDrawerContext);
  // Previously the default was three no-ops, so a widget rendered outside the
  // provider produced a row that simply did nothing when clicked.
  if (!handle) {
    throw new Error(
      "useDetailDrawer must be used inside <ReservationDetailProvider>"
    );
  }
  return handle;
}
