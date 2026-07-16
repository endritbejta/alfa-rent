import {
  Prisma,
  type Reservation,
  type ReservationStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { calculateTotalPrice } from "@/utils/pricing";
import { upsertCustomerByEmail } from "@/services/customer.service";
import type {
  AvailabilityInput,
  CreateBookingInput,
  ManualReservationInput,
} from "@/lib/validations/reservation";

/** Statuses that occupy the vehicle for a date range. */
const BLOCKING_STATUSES: ReservationStatus[] = ["CONFIRMED", "ACTIVE"];

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
    select: { status: true },
  });
  if (!vehicle) throw new NotFoundError("Vehicle");
  if (vehicle.status === "INACTIVE") return { available: false };

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
 * Public booking request. Created as PENDING — staff confirm it in the
 * dashboard. The availability check here is advisory UX; the authoritative
 * guard is the DB exclusion constraint, enforced when a reservation
 * becomes CONFIRMED.
 */
export async function createReservation(
  input: CreateBookingInput
): Promise<Reservation> {
  const { available } = await checkAvailability(input);
  if (!available) {
    throw new ConflictError("Vehicle is already booked for the selected dates");
  }

  const customer = await upsertCustomerByEmail(input.customer);

  return prisma.$transaction(async (tx) => {
    const vehicle = await tx.vehicle.findUnique({
      where: { id: input.vehicleId },
      select: { pricePerDay: true, status: true },
    });
    if (!vehicle) throw new NotFoundError("Vehicle");
    if (vehicle.status === "INACTIVE") {
      throw new ConflictError("Vehicle is not available for booking");
    }

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
      },
    });
  });
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
      select: { pricePerDay: true, status: true },
    });
    if (!vehicle) throw new NotFoundError("Vehicle");
    if (vehicle.status === "INACTIVE") {
      throw new ConflictError("Vehicle is not available for booking");
    }

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
  const reservation = await prisma.reservation.findUnique({ where: { id } });
  if (!reservation) throw new NotFoundError("Reservation");

  if (!ALLOWED_TRANSITIONS[reservation.status].includes(nextStatus)) {
    throw new ValidationError(
      `Cannot change a ${reservation.status} reservation to ${nextStatus}`
    );
  }

  return prisma.reservation.update({
    where: { id },
    data: { status: nextStatus },
  });
}

export async function cancelReservation(id: string): Promise<Reservation> {
  return updateReservationStatus(id, "CANCELLED");
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
    },
  });
  if (!reservation) throw new NotFoundError("Reservation");
  return reservation;
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
