import { beforeEach, describe, expect, it, vi } from "vitest";
import { PUBLIC_VEHICLES_TAG } from "@/lib/storefront-cache";

/*
 * Every server action that changes which days a car is taken, or what the
 * storefront shows of a car, expires the storefront's cache (audit P3-6).
 *
 * The date-filtered fleet list is cached for 60 seconds under one tag, and
 * the confirm, cancel and extend actions never expired it: a car confirmed a
 * moment ago was still offered as free. Each case below drives the real
 * action with the service and the guard standing in, and checks that
 * updateTag fired, after the write and only when the write succeeded.
 */
const { events, updateTag } = vi.hoisted(() => {
  const events: string[] = [];
  return {
    events,
    updateTag: vi.fn((tag: string) => {
      events.push(`updateTag:${tag}`);
    }),
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  updateTag,
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("next/navigation", async () =>
  (await import("@/lib/testing/action-mocks")).nextNavigationMock()
);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/i18n/server", async () =>
  (await import("@/lib/testing/action-mocks")).i18nServerMock()
);
vi.mock("@/lib/auth/guards", () => ({
  requireRole: vi.fn(async () => ({ id: "staff-1", role: "ADMIN" })),
  requireUser: vi.fn(async () => ({ id: "staff-1", role: "ADMIN" })),
}));
vi.mock("@/lib/observability");
vi.mock("@/lib/cloudinary");
vi.mock("@/lib/rate-limit");
vi.mock("@/services/reservation.service");
vi.mock("@/services/inspection.service");
vi.mock("@/services/customer-notification.service");
vi.mock("@/services/vehicle.service");
vi.mock("@/services/image.service");
vi.mock("@/services/fleet.service");

// The schemas have their own tests; here any input is let through, so each
// case is about what happens after the write.
const passthrough = {
  parse: (value: unknown) => value,
  safeParse: (value: unknown) => ({ success: true, data: value }),
};
vi.mock("@/lib/validations/reservation", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  updateReservationStatusSchema: passthrough,
  extendReservationSchema: passthrough,
  manualReservationSchema: passthrough,
}));
vi.mock("@/lib/validations/inspection", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  rentalInspectionSchema: passthrough,
  pastRentalSchema: passthrough,
}));
vi.mock("@/lib/validations/vehicle", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createVehicleSchema: passthrough,
  updateVehicleSchema: passthrough,
}));
vi.mock("@/lib/validations/image", () => ({
  parseVehicleImagesField: () => [],
}));

const reservations = await import("@/services/reservation.service");
const inspections = await import("@/services/inspection.service");
const vehicles = await import("@/services/vehicle.service");
const reservationActions =
  await import("@/app/(dashboard)/admin/reservations/actions");
const calendarActions =
  await import("@/app/(dashboard)/admin/calendar/actions");
const vehicleActions = await import("@/app/(dashboard)/admin/vehicles/actions");

type Case = {
  name: string;
  /** The service the action writes through. */
  write: ReturnType<typeof vi.fn>;
  run: () => Promise<unknown>;
};

const form = (fields: Record<string, string> = {}) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
};

const cases: Case[] = [
  {
    name: "confirming a request",
    write: vi.mocked(reservations.updateReservationStatus),
    run: () =>
      reservationActions.updateReservationStatusAction("r1", "CONFIRMED"),
  },
  {
    name: "cancelling a reservation",
    write: vi.mocked(reservations.updateReservationStatus),
    run: () =>
      reservationActions.updateReservationStatusAction(
        "r1",
        "CANCELLED",
        "Customer called to cancel"
      ),
  },
  {
    name: "extending a rental",
    write: vi.mocked(reservations.extendReservation),
    run: () => reservationActions.extendReservationAction("r1", "2030-01-10"),
  },
  {
    name: "a pickup or return inspection (start, completion, early return, late charge)",
    write: vi.mocked(inspections.recordRentalInspection),
    run: () =>
      reservationActions.recordRentalInspectionAction(
        "r1",
        form({ type: "RETURN" })
      ),
  },
  {
    name: "recording a past rental",
    write: vi.mocked(inspections.recordPastRental),
    run: () => reservationActions.recordPastRentalAction("r1", form()),
  },
  {
    name: "a staff booking from the calendar or the new-reservation dialog",
    write: vi.mocked(reservations.createManualReservation),
    run: () => calendarActions.createManualReservationAction({}),
  },
  {
    name: "editing a vehicle",
    write: vi.mocked(vehicles.updateVehicle),
    run: () => vehicleActions.updateVehicleAction("v1", form()),
  },
  {
    name: "deleting or retiring a vehicle",
    write: vi.mocked(vehicles.deleteVehicle),
    run: () => vehicleActions.deleteVehicleAction("v1"),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  events.length = 0;
});

describe("storefront cache invalidation", () => {
  it.each(cases)(
    "$name expires the storefront tag after the write",
    async ({ write, run }) => {
      write.mockImplementation(async () => {
        events.push("write");
        return {} as never;
      });

      // The vehicle edit ends in a redirect, which the mock throws.
      await run().catch(() => undefined);

      expect(updateTag).toHaveBeenCalledWith(PUBLIC_VEHICLES_TAG);
      expect(events).toEqual(["write", `updateTag:${PUBLIC_VEHICLES_TAG}`]);
    }
  );

  it.each(cases)(
    "$name leaves the cache alone when the write fails",
    async ({ write, run }) => {
      write.mockRejectedValue(new Error("refused"));

      await run().catch(() => undefined);

      expect(updateTag).not.toHaveBeenCalled();
    }
  );

  it("creating a vehicle expires the storefront tag", async () => {
    vi.mocked(vehicles.createVehicle).mockResolvedValue({
      id: "v1",
    } as never);

    await vehicleActions.createVehicleAction(form()).catch(() => undefined);

    expect(updateTag).toHaveBeenCalledWith(PUBLIC_VEHICLES_TAG);
  });
});
