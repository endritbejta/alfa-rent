import {
  Prisma,
  type Reservation,
  type ReservationStatus,
} from "@prisma/client";
import { format } from "date-fns";
import { prisma } from "@/lib/db/prisma";
import type { TranslationKey } from "@/lib/i18n/translations";
import { RESERVATION_STATUS_KEYS } from "@/lib/status-labels";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  phrase,
} from "@/lib/errors";
import { calculateTotalPrice, rentalDays } from "@/lib/pricing";
import { latestUnder, withTimeOfDay } from "@/lib/rental-dates";
import {
  getReservationTiming,
  rentalCalendarDay,
} from "@/lib/reservation-lifecycle";
import {
  findOrCreateCustomerByEmail,
  getCustomerSpend,
} from "@/services/customer.service";
import { isPublicBookableVehicleStatus } from "@/lib/vehicle-policy";
import { createPaymentAccessToken } from "@/lib/payments/access-token";
import type { VehicleBookingCalendar } from "@/lib/booking-calendar";
import type {
  AvailabilityInput,
  CreateBookingInput,
  ManualReservationInput,
} from "@/lib/validations/reservation";

/** Statuses that occupy the vehicle for a date range. */
const BLOCKING_STATUSES: ReservationStatus[] = ["CONFIRMED", "ACTIVE"];

/**
 * Only a commitment can be extended. PENDING is still a request — staff
 * decide it rather than reshape it — and COMPLETED/CANCELLED are history,
 * where moving a return date would rewrite a settled total.
 */
const EXTENDABLE_STATUSES: ReservationStatus[] = ["CONFIRMED", "ACTIVE"];

const day = (d: Date) => format(d, "dd MMM yyyy");

function registrationCovers(
  registrationExpiry: Date | null,
  returnDate: Date
): boolean {
  return (
    registrationExpiry === null ||
    returnDate.getTime() <= registrationExpiry.getTime()
  );
}

function assertRegistrationCovers(
  registrationExpiry: Date | null,
  returnDate: Date
) {
  if (!registrationCovers(registrationExpiry, returnDate)) {
    throw new ValidationError(
      `The vehicle's registration expires on ${day(registrationExpiry!)}; the rental cannot run past it.`,
      {
        key: "err.registrationExpires",
        values: { date: day(registrationExpiry!) },
      }
    );
  }
}

/** Which transitions the business allows, e.g. no un-cancelling. */
const ALLOWED_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export async function checkAvailability({
  vehicleId,
  pickupDate,
  returnDate,
}: AvailabilityInput): Promise<{ available: boolean }> {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { status: true, registrationExpiry: true },
  });
  if (!vehicle) throw new NotFoundError("Vehicle");
  if (
    !isPublicBookableVehicleStatus(vehicle.status) ||
    !registrationCovers(vehicle.registrationExpiry, returnDate)
  ) {
    return { available: false };
  }

  const overlapping = await prisma.reservation.count({
    where: {
      vehicleId,
      status: { in: BLOCKING_STATUSES },
      pickupDate: { lt: returnDate },
      returnDate: { gt: pickupDate },
    },
  });
  return { available: overlapping === 0 };
}

export async function getQuote({
  vehicleId,
  pickupDate,
  returnDate,
}: AvailabilityInput) {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { pricePerDay: true },
  });
  if (!vehicle) throw new NotFoundError("Vehicle");
  return calculateTotalPrice(vehicle.pricePerDay, pickupDate, returnDate);
}

/**
 * Public booking constraints for one vehicle.
 *
 * Returned as calendar-day strings so the server and browser use the same
 * half-open interval contract without timezone conversion at the RSC boundary.
 */
export async function getVehicleBookingCalendar(
  vehicleId: string
): Promise<VehicleBookingCalendar> {
  const [vehicle, reservations] = await prisma.$transaction([
    prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { registrationExpiry: true },
    }),
    prisma.reservation.findMany({
      where: {
        vehicleId,
        status: { in: BLOCKING_STATUSES },
        returnDate: { gt: new Date() },
      },
      orderBy: { pickupDate: "asc" },
      select: { pickupDate: true, returnDate: true },
    }),
  ]);

  if (!vehicle) throw new NotFoundError("Vehicle");

  return {
    blockedRanges: reservations.map((reservation) => ({
      from: rentalCalendarDay(reservation.pickupDate),
      to: rentalCalendarDay(reservation.returnDate),
    })),
    latestReturnDate: vehicle.registrationExpiry
      ? rentalCalendarDay(vehicle.registrationExpiry)
      : null,
  };
}

/**
 * Public booking request. Created as PENDING — staff confirm it in the
 * dashboard. The availability check here is advisory UX; the authoritative
 * guard is the DB exclusion constraint, enforced when a reservation
 * becomes CONFIRMED.
 */
export async function createReservation(input: CreateBookingInput): Promise<{
  reservation: Reservation;
  paymentAccessToken: string;
}> {
  const { available } = await checkAvailability(input);
  if (!available) {
    throw new ConflictError(
      "Vehicle is already booked for the selected dates",
      { key: "err.alreadyBooked" }
    );
  }

  const customer = await findOrCreateCustomerByEmail(input.customer);

  const paymentAccess = createPaymentAccessToken();
  const reservation = await prisma.$transaction(async (tx) => {
    const vehicle = await tx.vehicle.findUnique({
      where: { id: input.vehicleId },
      select: {
        pricePerDay: true,
        status: true,
        registrationExpiry: true,
      },
    });
    if (!vehicle) throw new NotFoundError("Vehicle");
    if (!isPublicBookableVehicleStatus(vehicle.status)) {
      throw new ConflictError("Vehicle is not available for booking", {
        key: "err.notBookable",
      });
    }
    assertRegistrationCovers(vehicle.registrationExpiry, input.returnDate);

    return tx.reservation.create({
      data: {
        vehicleId: input.vehicleId,
        customerId: customer.id,
        pickupDate: input.pickupDate,
        returnDate: input.returnDate,
        totalPrice: calculateTotalPrice(
          vehicle.pricePerDay,
          input.pickupDate,
          input.returnDate
        ),
        notes: input.notes,
        status: "PENDING",
        paymentAccessTokenHash: paymentAccess.hash,
      },
    });
  });
  return { reservation, paymentAccessToken: paymentAccess.token };
}

/**
 * Staff-created reservation with a chosen status. Customer and reservation
 * are written in one transaction so a double-booking rejection (the DB
 * exclusion constraint, for CONFIRMED/ACTIVE) rolls back the walk-in
 * customer instead of orphaning it.
 */
export async function createManualReservation(
  input: ManualReservationInput
): Promise<Reservation> {
  const parts = input.customerName.trim().split(/\s+/);
  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ") || "-";

  return prisma.$transaction(async (tx) => {
    const vehicle = await tx.vehicle.findUnique({
      where: { id: input.vehicleId },
      select: {
        pricePerDay: true,
        status: true,
        registrationExpiry: true,
      },
    });
    if (!vehicle) throw new NotFoundError("Vehicle");
    if (vehicle.status === "INACTIVE") {
      throw new ConflictError("Vehicle is not available for booking", {
        key: "err.notBookable",
      });
    }
    assertRegistrationCovers(vehicle.registrationExpiry, input.returnDate);

    const customer = await tx.customer.create({
      data: {
        firstName,
        lastName,
        email: `walkin.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@alfarent.local`,
        phone: "-",
      },
    });

    return tx.reservation.create({
      data: {
        vehicleId: input.vehicleId,
        customerId: customer.id,
        pickupDate: input.pickupDate,
        returnDate: input.returnDate,
        status: input.status,
        totalPrice: calculateTotalPrice(
          vehicle.pricePerDay,
          input.pickupDate,
          input.returnDate
        ),
        notes: input.notes,
      },
    });
  });
}

export async function getReservations(filters: {
  status?: ReservationStatus;
  vehicleId?: string;
  page: number;
  perPage: number;
}) {
  const { status, vehicleId, page, perPage } = filters;
  const where: Prisma.ReservationWhereInput = {
    ...(status && { status }),
    ...(vehicleId && { vehicleId }),
  };
  const [items, total] = await prisma.$transaction([
    prisma.reservation.findMany({
      where,
      include: {
        vehicle: {
          select: { brand: true, model: true, plate: true, slug: true },
        },
        customer: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { pickupDate: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.reservation.count({ where }),
  ]);
  return {
    items,
    total,
    page,
    perPage,
    totalPages: Math.ceil(total / perPage),
  };
}

/**
 * Status changes go through the transition table; the PENDING → CONFIRMED
 * step is where the DB exclusion constraint has the final word on
 * double-booking, so two staff members confirming competing requests
 * cannot both succeed.
 */
export async function updateReservationStatus(
  id: string,
  nextStatus: ReservationStatus
): Promise<Reservation> {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({
      where: { id },
      include: { vehicle: { select: { registrationExpiry: true } } },
    });
    if (!reservation) throw new NotFoundError("Reservation");

    if (!ALLOWED_TRANSITIONS[reservation.status].includes(nextStatus)) {
      throw new ValidationError(
        `Cannot change a ${reservation.status} reservation to ${nextStatus}`,
        {
          key: "err.badTransition",
          values: {
            from: phrase(RESERVATION_STATUS_KEYS[reservation.status]),
            to: phrase(RESERVATION_STATUS_KEYS[nextStatus]),
          },
        }
      );
    }

    if (nextStatus === "ACTIVE" || nextStatus === "COMPLETED") {
      throw new ValidationError(
        nextStatus === "ACTIVE"
          ? "Record the pickup inspection to start this rental"
          : "Record the return inspection to complete this rental",
        {
          key:
            nextStatus === "ACTIVE"
              ? "err.pickupInspectionFirst"
              : "err.returnInspectionFirst",
        }
      );
    }

    if (nextStatus === "CONFIRMED") {
      assertRegistrationCovers(
        reservation.vehicle.registrationExpiry,
        reservation.returnDate
      );
    }

    const changed = await tx.reservation.updateMany({
      where: { id, status: reservation.status },
      data: { status: nextStatus },
    });
    if (changed.count !== 1) {
      throw new ConflictError(
        "Reservation changed while you were working. Refresh and try again.",
        { key: "err.changedUnderYou" }
      );
    }
    return tx.reservation.findUniqueOrThrow({ where: { id } });
  });
}

export async function cancelReservation(id: string): Promise<Reservation> {
  return updateReservationStatus(id, "CANCELLED");
}

/**
 * How far a reservation can be extended, and what stops it going further.
 *
 * Computed alongside the detail so the drawer can bound its date input up
 * front: staff see the ceiling instead of discovering it by being refused.
 */
/**
 * Why an extension is refused, as a code rather than a sentence.
 *
 * The drawer used to identify these by comparing `reason` against the exact
 * English string this service produced, so editing the wording here silently
 * degraded the UI to a generic message — and one of the four cases never
 * matched at all, because it was interpolated from the status. A code is also
 * what makes the message translatable: the service has no locale.
 */
export type ExtensionRefusal =
  | "NOT_YET_CONFIRMED"
  | "BOOKED_IMMEDIATELY_AFTER"
  | "REGISTRATION_ENDS"
  | "NOT_EXTENDABLE";

export type ExtensionWindow =
  | { allowed: false; reason: ExtensionRefusal }
  | {
      allowed: true;
      /** null means nothing on the calendar limits it. */
      latestReturn: Date | null;
      limitedBy: "booking" | "registration" | null;
    };

async function getExtensionWindow(reservation: {
  id: string;
  vehicleId: string;
  status: ReservationStatus;
  returnDate: Date;
  vehicle: { registrationExpiry: Date | null };
}): Promise<ExtensionWindow> {
  if (!EXTENDABLE_STATUSES.includes(reservation.status)) {
    return { allowed: false, reason: extensionRefusal(reservation.status) };
  }

  // The vehicle's next commitment. tsrange is half-open, so a return landing
  // exactly on the next pickup is not an overlap and is therefore allowed.
  const next = await prisma.reservation.findFirst({
    where: {
      id: { not: reservation.id },
      vehicleId: reservation.vehicleId,
      status: { in: BLOCKING_STATUSES },
      pickupDate: { gte: reservation.returnDate },
    },
    orderBy: { pickupDate: "asc" },
    select: { pickupDate: true },
  });

  const ceilings: { at: Date; by: "booking" | "registration" }[] = [];
  if (next) {
    ceilings.push({
      at: latestUnder(reservation.returnDate, next.pickupDate),
      by: "booking",
    });
  }
  if (reservation.vehicle.registrationExpiry) {
    ceilings.push({
      at: latestUnder(
        reservation.returnDate,
        reservation.vehicle.registrationExpiry
      ),
      by: "registration",
    });
  }

  if (ceilings.length === 0) {
    return { allowed: true, latestReturn: null, limitedBy: null };
  }

  const tightest = ceilings.reduce((a, b) => (a.at <= b.at ? a : b));

  // Whatever comes next leaves no room at all — say so now rather than let
  // staff pick a date and be refused.
  if (tightest.at.getTime() <= reservation.returnDate.getTime()) {
    return {
      allowed: false,
      reason:
        tightest.by === "booking"
          ? "BOOKED_IMMEDIATELY_AFTER"
          : "REGISTRATION_ENDS",
    };
  }

  return { allowed: true, latestReturn: tightest.at, limitedBy: tightest.by };
}

function extensionRefusal(status: ReservationStatus): ExtensionRefusal {
  // PENDING is a request staff have not decided yet; COMPLETED and CANCELLED
  // are history. Only the first is worth a specific instruction.
  return status === "PENDING" ? "NOT_YET_CONFIRMED" : "NOT_EXTENDABLE";
}

/**
 * The same refusals as prose, for the paths that throw.
 *
 * The drawer never reaches these — it has the code and its own translations.
 * But every export of a `"use server"` file is a callable endpoint, so
 * extendReservation can be invoked without the drawer ever computing a window,
 * and a thrown AppError's message is shown verbatim. English until server
 * errors are translated wholesale.
 */
/** The same refusals, named for the reader's language. */
const REFUSAL_KEYS = {
  NOT_YET_CONFIRMED: "err.notYetConfirmed",
  BOOKED_IMMEDIATELY_AFTER: "err.bookedImmediatelyAfter",
  REGISTRATION_ENDS: "err.registrationEnds",
  NOT_EXTENDABLE: "err.notExtendable",
} satisfies Record<ExtensionRefusal, TranslationKey>;

const REFUSAL_MESSAGES = {
  NOT_YET_CONFIRMED: "Confirm this request before extending it.",
  BOOKED_IMMEDIATELY_AFTER:
    "The vehicle is booked again immediately after this rental.",
  REGISTRATION_ENDS:
    "The vehicle's registration expires at the end of this rental.",
  NOT_EXTENDABLE: "This reservation cannot be extended.",
} satisfies Record<ExtensionRefusal, string>;

/**
 * Extends a rental in place — no second booking, no gap in the record.
 *
 * The overlap check here is advisory, exactly as elsewhere: the
 * reservations_no_overlap exclusion constraint is what actually prevents a
 * double-booking when two staff extend competing rentals at once. Reading it
 * first only buys a message that names the conflicting date instead of a raw
 * Postgres 23P01.
 */
export async function extendReservation(
  id: string,
  newReturnDate: Date
): Promise<Reservation> {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({
      where: { id },
      include: {
        vehicle: { select: { pricePerDay: true, registrationExpiry: true } },
      },
    });
    if (!reservation) throw new NotFoundError("Reservation");

    if (!EXTENDABLE_STATUSES.includes(reservation.status)) {
      const refusal = extensionRefusal(reservation.status);
      throw new ValidationError(REFUSAL_MESSAGES[refusal], {
        key: REFUSAL_KEYS[refusal],
      });
    }

    const target = withTimeOfDay(reservation.returnDate, newReturnDate);
    if (target.getTime() <= reservation.returnDate.getTime()) {
      throw new ValidationError(
        `The new return date must be after the current one (${day(reservation.returnDate)}).`,
        {
          key: "err.returnMustBeLater",
          values: { date: day(reservation.returnDate) },
        }
      );
    }

    assertRegistrationCovers(reservation.vehicle.registrationExpiry, target);

    const clash = await tx.reservation.findFirst({
      where: {
        id: { not: id },
        vehicleId: reservation.vehicleId,
        status: { in: BLOCKING_STATUSES },
        pickupDate: { lt: target },
        returnDate: { gt: reservation.pickupDate },
      },
      orderBy: { pickupDate: "asc" },
      select: { pickupDate: true },
    });
    if (clash) {
      throw new ConflictError(
        `This vehicle is booked again from ${day(clash.pickupDate)}, so it cannot be kept until ${day(target)}.`,
        {
          key: "err.bookedAgainFrom",
          values: { from: day(clash.pickupDate), until: day(target) },
        }
      );
    }

    // The originally agreed days keep the price they were agreed at; only
    // the added days are charged at today's rate.
    const extraDays =
      rentalDays(reservation.pickupDate, target) -
      rentalDays(reservation.pickupDate, reservation.returnDate);

    const changed = await tx.reservation.updateMany({
      where: {
        id,
        status: reservation.status,
        returnDate: reservation.returnDate,
      },
      data: {
        returnDate: target,
        totalPrice: reservation.totalPrice.add(
          reservation.vehicle.pricePerDay.mul(extraDays)
        ),
      },
    });
    if (changed.count !== 1) {
      throw new ConflictError(
        "Reservation changed while you were working. Refresh and try again.",
        { key: "err.changedUnderYou" }
      );
    }
    return tx.reservation.findUniqueOrThrow({ where: { id } });
  });
}

/**
 * Everything the detail drawer shows: the reservation plus enough of the
 * customer's and vehicle's context that staff never have to navigate away.
 */
export async function getReservationDetail(id: string) {
  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: {
      vehicle: {
        select: {
          id: true,
          brand: true,
          model: true,
          plate: true,
          year: true,
          category: true,
          transmission: true,
          fuelType: true,
          seats: true,
          pricePerDay: true,
          status: true,
          registrationExpiry: true,
          images: { take: 1, orderBy: { sortOrder: "asc" } },
        },
      },
      customer: {
        include: {
          reservations: {
            orderBy: { pickupDate: "desc" },
            take: 20,
            select: {
              id: true,
              status: true,
              pickupDate: true,
              returnDate: true,
              totalPrice: true,
              vehicle: { select: { brand: true, model: true, plate: true } },
            },
          },
        },
      },
      inspections: {
        orderBy: { createdAt: "asc" },
        include: {
          photos: { orderBy: { sortOrder: "asc" } },
          createdBy: { select: { name: true } },
        },
      },
    },
  });
  if (!reservation) throw new NotFoundError("Reservation");
  const [extension, customerSpend] = await Promise.all([
    // Bundled with the detail so opening the drawer is still one round trip.
    getExtensionWindow(reservation),
    // Aggregated rather than summed from the 20 reservations included above:
    // that reduce understated a repeat customer and disagreed with the number
    // the customer drawer showed for the same person.
    getCustomerSpend(reservation.customerId),
  ]);
  return {
    ...reservation,
    timing: getReservationTiming(reservation),
    extension,
    customer: { ...reservation.customer, spend: customerSpend },
  };
}

/** Requests awaiting a staff decision — surfaced across the admin. */
export async function getPendingCount(): Promise<number> {
  return prisma.reservation.count({ where: { status: "PENDING" } });
}

/**
 * Earliest pickup and latest return among open reservations — the span the
 * continuous calendar renders, so scrolling covers exactly the months that
 * hold work rather than an arbitrary infinite range.
 */
export async function getReservationDateBounds() {
  const bounds = await prisma.reservation.aggregate({
    _min: { pickupDate: true },
    _max: { returnDate: true },
    where: { status: { in: ["PENDING", "CONFIRMED", "ACTIVE"] } },
  });
  return {
    min: bounds._min.pickupDate ?? null,
    max: bounds._max.returnDate ?? null,
  };
}

/** Vehicles with their open reservations overlapping a date window. */
export async function getCalendarReservations(from: Date, to: Date) {
  return prisma.vehicle.findMany({
    where: { status: { not: "INACTIVE" } },
    orderBy: [{ brand: "asc" }, { model: "asc" }],
    select: {
      id: true,
      brand: true,
      model: true,
      plate: true,
      year: true,
      reservations: {
        where: {
          status: { in: ["PENDING", "CONFIRMED", "ACTIVE"] },
          pickupDate: { lte: to },
          returnDate: { gte: from },
        },
        select: {
          id: true,
          pickupDate: true,
          returnDate: true,
          status: true,
          customer: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
}
