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
  IdempotencyKeyReusedError,
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
import {
  isOverdueRental,
  occupyingReservationWhere,
  overdueRentalWhere,
} from "@/lib/reservation-occupancy";
import { createPaymentAccessToken } from "@/lib/payments/access-token";
import type { VehicleBookingCalendar } from "@/lib/booking-calendar";
import {
  contactSnapshot,
  contactSnapshotData,
  reservationContactDifference,
  type ContactSnapshotColumns,
} from "@/lib/booking-contact";
import type {
  AvailabilityInput,
  CreateBookingInput,
  ManualReservationInput,
  ReservationPreviewInput,
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

/** Sorts after every real calendar day, so a blocked range never ends. */
const OPEN_ENDED_DAY = "9999-12-31";

/**
 * Refuses a commitment on a car that is still out on an overdue rental.
 *
 * The exclusion constraint compares scheduled ranges only, so it would accept
 * this booking; see occupyingReservationWhere for why the car is not free.
 */
async function assertNoOverdueRental(
  tx: Prisma.TransactionClient,
  vehicleId: string,
  returnDate: Date,
  excludeId?: string
) {
  const overdue = await tx.reservation.findFirst({
    where: {
      vehicleId,
      ...(excludeId && { id: { not: excludeId } }),
      ...overdueRentalWhere(returnDate),
    },
    select: { returnDate: true },
  });
  if (overdue) {
    throw new ConflictError(
      `This vehicle has not been returned from a rental that was due back on ${day(overdue.returnDate)}.`,
      { key: "err.overdueRental", values: { date: day(overdue.returnDate) } }
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
    select: { status: true },
  });
  if (!vehicle) throw new NotFoundError("Vehicle");
  if (!isPublicBookableVehicleStatus(vehicle.status)) {
    return { available: false };
  }

  const overlapping = await prisma.reservation.count({
    where: {
      vehicleId,
      ...occupyingReservationWhere({ pickupDate, returnDate }),
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
      select: { id: true },
    }),
    prisma.reservation.findMany({
      where: {
        vehicleId,
        status: { in: BLOCKING_STATUSES },
        // An overdue ACTIVE rental is past its return date but still blocks.
        OR: [{ returnDate: { gt: new Date() } }, { status: "ACTIVE" }],
      },
      orderBy: { pickupDate: "asc" },
      select: { pickupDate: true, returnDate: true, status: true },
    }),
  ]);

  if (!vehicle) throw new NotFoundError("Vehicle");

  return {
    blockedRanges: reservations.map((reservation) => ({
      from: rentalCalendarDay(reservation.pickupDate),
      // Open-ended until the return is recorded; compared as a string.
      to: isOverdueRental(reservation)
        ? OPEN_ENDED_DAY
        : rentalCalendarDay(reservation.returnDate),
    })),
  };
}

/**
 * Whether a failed write was the unique index on `field` refusing a
 * duplicate. Prisma reports the target as field names or, with some drivers,
 * as the index name; both contain the field.
 */
function isUniqueViolationOn(error: unknown, field: string): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }
  const target = error.meta?.target;
  return Array.isArray(target)
    ? target.includes(field)
    : typeof target === "string" && target.includes(field);
}

/**
 * Whether a stored reservation is the booking a retried request describes.
 *
 * The client mints a new key whenever any detail changes, so a key arriving
 * with a different car or different dates is a buggy or hostile client. It is
 * refused rather than answered with whatever reservation the key points at.
 */
function assertSameBooking(
  existing: Pick<Reservation, "vehicleId" | "pickupDate" | "returnDate">,
  input: { vehicleId: string; pickupDate: Date; returnDate: Date }
) {
  if (
    existing.vehicleId !== input.vehicleId ||
    existing.pickupDate.getTime() !== input.pickupDate.getTime() ||
    existing.returnDate.getTime() !== input.returnDate.getTime()
  ) {
    throw new IdempotencyKeyReusedError();
  }
}

/**
 * Whether a retried request carries the contact details the first one did.
 *
 * Compared with what that request submitted, not with the customer it was
 * linked to: the customer may hold other details, and staff may have edited
 * them since. A key with a different name or phone is another booking, so it
 * is refused like one with other dates. A reservation from before the
 * snapshot has only the customer's email to go on.
 */
function sameSubmittedContact(
  existing: ContactSnapshotColumns & { customer: { email: string } },
  submitted: CreateBookingInput["customer"]
): boolean {
  const snapshot = contactSnapshot(existing);
  if (!snapshot) {
    return (
      existing.customer.email.toLowerCase() === submitted.email.toLowerCase()
    );
  }
  const typed = submittedContact(submitted);
  return (
    snapshot.email.toLowerCase() === typed.email.toLowerCase() &&
    snapshot.firstName === typed.firstName &&
    snapshot.lastName === typed.lastName &&
    snapshot.phone === typed.phone
  );
}

/** The booking form's contact details as stored on the reservation. */
function submittedContact(customer: CreateBookingInput["customer"]) {
  return {
    firstName: customer.firstName.trim(),
    lastName: customer.lastName.trim(),
    email: customer.email.trim(),
    phone: customer.phone.trim(),
  };
}

/**
 * The reservation an earlier public request with this key made, if any.
 *
 * The payment token is rotated rather than repeated: only its hash is stored,
 * and the raw token left in the response that never arrived — which is the
 * reason this request exists at all. Rotating also means the one token that
 * works is the one in the answer the customer actually received.
 */
async function replayBooking(
  key: string,
  input: CreateBookingInput
): Promise<{ reservation: Reservation; paymentAccessToken: string } | null> {
  const existing = await prisma.reservation.findUnique({
    where: { idempotencyKey: key },
    include: { customer: { select: { email: true } } },
  });
  if (!existing) return null;
  assertSameBooking(existing, input);
  if (
    !sameSubmittedContact(existing, input.customer) ||
    (existing.notes ?? "") !== (input.notes ?? "")
  ) {
    throw new IdempotencyKeyReusedError();
  }

  const paymentAccess = createPaymentAccessToken();
  const reservation = await prisma.reservation.update({
    where: { id: existing.id },
    data: { paymentAccessTokenHash: paymentAccess.hash },
  });
  return { reservation, paymentAccessToken: paymentAccess.token };
}

/**
 * Public booking request. Created as PENDING — staff confirm it in the
 * dashboard. The availability check here is advisory UX; the authoritative
 * guard is the DB exclusion constraint, enforced when a reservation
 * becomes CONFIRMED.
 *
 * With an idempotency key, a retry of a request that already landed returns
 * that reservation (`replayed: true`) instead of queueing a second one. The
 * key is looked up before anything else, so a retry still succeeds after
 * staff have confirmed the original — its own confirmation would otherwise
 * make the availability check below refuse it.
 */
export async function createReservation(
  input: CreateBookingInput,
  { idempotencyKey }: { idempotencyKey?: string } = {}
): Promise<{
  reservation: Reservation;
  paymentAccessToken: string;
  replayed: boolean;
}> {
  if (idempotencyKey) {
    const replay = await replayBooking(idempotencyKey, input);
    if (replay) return { ...replay, replayed: true };
  }

  const { available } = await checkAvailability(input);
  if (!available) {
    throw new ConflictError(
      "Vehicle is already booked for the selected dates",
      { key: "err.alreadyBooked" }
    );
  }

  const customer = await findOrCreateCustomerByEmail(input.customer);

  const paymentAccess = createPaymentAccessToken();
  let reservation: Reservation;
  try {
    reservation = await prisma.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.findUnique({
        where: { id: input.vehicleId },
        select: {
          pricePerDay: true,
          status: true,
        },
      });
      if (!vehicle) throw new NotFoundError("Vehicle");
      if (!isPublicBookableVehicleStatus(vehicle.status)) {
        throw new ConflictError("Vehicle is not available for booking", {
          key: "err.notBookable",
        });
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
          paymentAccessTokenHash: paymentAccess.hash,
          idempotencyKey,
          // What was typed, kept even when the email matched a customer whose
          // record findOrCreateCustomerByEmail leaves untouched.
          ...contactSnapshotData(submittedContact(input.customer)),
        },
      });
    });
  } catch (error) {
    // Two requests with one key both got past the lookup above. The unique
    // index let one insert through and held the other until it committed;
    // the loser answers with the winner's reservation.
    if (idempotencyKey && isUniqueViolationOn(error, "idempotencyKey")) {
      const replay = await replayBooking(idempotencyKey, input);
      if (replay) return { ...replay, replayed: true };
    }
    throw error;
  }
  return {
    reservation,
    paymentAccessToken: paymentAccess.token,
    replayed: false,
  };
}

/**
 * Staff-created reservation with a chosen status, for a customer on file or
 * one entered on the spot. Customer and reservation are written in one
 * transaction so a double-booking rejection (the DB exclusion constraint, for
 * CONFIRMED/ACTIVE) rolls back the new customer instead of orphaning it.
 *
 * A retry carrying the dialog's idempotency key returns the reservation the
 * first attempt made. Without it a CONFIRMED retry was refused as a
 * double-booking — of itself — and a PENDING one was simply made twice, a
 * walk-in customer and all.
 */
export async function createManualReservation(
  input: ManualReservationInput
): Promise<Reservation> {
  const key = input.idempotencyKey;
  if (key) {
    const earlier = await findManualReplay(key, input);
    if (earlier) return earlier;
  }
  try {
    return await insertManualReservation(input);
  } catch (error) {
    if (key && isUniqueViolationOn(error, "idempotencyKey")) {
      const earlier = await findManualReplay(key, input);
      if (earlier) return earlier;
    }
    throw error;
  }
}

/**
 * The reservation an earlier staff request with this key made, checked to be
 * the same booking. Status is not compared: a colleague may already have
 * moved it on, and that is not a reason to refuse the retry.
 */
async function findManualReplay(
  key: string,
  input: ManualReservationInput
): Promise<Reservation | null> {
  const existing = await prisma.reservation.findUnique({
    where: { idempotencyKey: key },
  });
  if (!existing) return null;
  assertSameBooking(existing, input);
  if (
    input.customer.kind === "existing" &&
    existing.customerId !== input.customer.id
  ) {
    throw new IdempotencyKeyReusedError();
  }
  return existing;
}

async function insertManualReservation(
  input: ManualReservationInput
): Promise<Reservation> {
  return prisma.$transaction(async (tx) => {
    const vehicle = await tx.vehicle.findUnique({
      where: { id: input.vehicleId },
      select: {
        pricePerDay: true,
        status: true,
      },
    });
    if (!vehicle) throw new NotFoundError("Vehicle");
    if (vehicle.status === "INACTIVE") {
      throw new ConflictError("Vehicle is not available for booking", {
        key: "err.notBookable",
      });
    }
    if (input.status === "CONFIRMED") {
      await assertNoOverdueRental(tx, input.vehicleId, input.returnDate);
    }

    const customerId = await resolveManualCustomer(tx, input.customer);

    return tx.reservation.create({
      data: {
        vehicleId: input.vehicleId,
        customerId,
        pickupDate: input.pickupDate,
        returnDate: input.returnDate,
        status: input.status,
        totalPrice: calculateTotalPrice(
          vehicle.pricePerDay,
          input.pickupDate,
          input.returnDate
        ),
        notes: input.notes,
        idempotencyKey: input.idempotencyKey,
      },
    });
  });
}

/**
 * The customer a staff booking belongs to.
 *
 * A new customer who gives an email already on file is refused rather than
 * silently attached to that record: the name or phone may well differ, and
 * staff should pick the existing customer knowingly. Without an email the
 * record gets a unique placeholder, because the column is required and
 * unique; the phone is what staff will actually use.
 */
async function resolveManualCustomer(
  tx: Prisma.TransactionClient,
  customer: ManualReservationInput["customer"]
): Promise<string> {
  if (customer.kind === "existing") {
    const found = await tx.customer.findUnique({
      where: { id: customer.id },
      select: { id: true },
    });
    if (!found) throw new NotFoundError("Customer");
    return found.id;
  }

  if (customer.email) {
    const taken = await tx.customer.findUnique({
      where: { email: customer.email },
      select: { id: true },
    });
    if (taken) {
      throw new ConflictError("A customer with this email already exists", {
        key: "err.customerExistsSelect",
      });
    }
  }

  const created = await tx.customer.create({
    data: {
      firstName: customer.firstName,
      lastName: customer.lastName || "-",
      phone: customer.phone,
      email:
        customer.email ??
        `walkin.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@alfarent.local`,
    },
    select: { id: true },
  });
  return created.id;
}

/** Why a staff booking would be refused or need a second look. */
export type BookingProblem =
  | { kind: "inactive" }
  | { kind: "overdue"; date: string }
  | { kind: "booked"; from: string; to: string };

export type BookingPreview = {
  days: number;
  pricePerDay: number;
  totalPrice: number;
  problems: BookingProblem[];
};

/**
 * What the booking dialog shows before staff commit: the price that will be
 * stored, and every reason the booking would be refused as CONFIRMED.
 *
 * Advisory, like every availability read here — the create path re-checks
 * inside its transaction and the exclusion constraint has the final word.
 * Dates go back as calendar-day strings so the browser shows the same day
 * the database holds.
 */
export async function previewManualReservation(
  input: ReservationPreviewInput
): Promise<BookingPreview> {
  const { vehicleId, pickupDate, returnDate } = input;
  const [vehicle, overdue, clash] = await Promise.all([
    prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { pricePerDay: true, status: true },
    }),
    prisma.reservation.findFirst({
      where: { vehicleId, ...overdueRentalWhere(returnDate) },
      select: { returnDate: true },
    }),
    prisma.reservation.findFirst({
      where: {
        vehicleId,
        status: { in: BLOCKING_STATUSES },
        pickupDate: { lt: returnDate },
        returnDate: { gt: pickupDate },
      },
      orderBy: { pickupDate: "asc" },
      select: { pickupDate: true, returnDate: true },
    }),
  ]);
  if (!vehicle) throw new NotFoundError("Vehicle");

  const problems: BookingProblem[] = [];
  if (vehicle.status === "INACTIVE") problems.push({ kind: "inactive" });
  if (overdue) {
    problems.push({
      kind: "overdue",
      date: rentalCalendarDay(overdue.returnDate),
    });
  }
  if (clash) {
    problems.push({
      kind: "booked",
      from: rentalCalendarDay(clash.pickupDate),
      to: rentalCalendarDay(clash.returnDate),
    });
  }

  return {
    days: rentalDays(pickupDate, returnDate),
    pricePerDay: Number(vehicle.pricePerDay),
    totalPrice: Number(
      calculateTotalPrice(vehicle.pricePerDay, pickupDate, returnDate)
    ),
    problems,
  };
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
        // Phone and notes too: the pending queue compares the request's
        // submitted details with these, and can copy them onto the record.
        customer: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            notes: true,
          },
        },
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
      await assertNoOverdueRental(
        tx,
        reservation.vehicleId,
        reservation.returnDate,
        reservation.id
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
  "NOT_YET_CONFIRMED" | "BOOKED_IMMEDIATELY_AFTER" | "NOT_EXTENDABLE";

export type ExtensionWindow =
  | { allowed: false; reason: ExtensionRefusal }
  | {
      allowed: true;
      /** null means nothing on the calendar limits it. */
      latestReturn: Date | null;
      limitedBy: "booking" | null;
    };

async function getExtensionWindow(reservation: {
  id: string;
  vehicleId: string;
  status: ReservationStatus;
  returnDate: Date;
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

  if (!next) {
    return { allowed: true, latestReturn: null, limitedBy: null };
  }

  const latestReturn = latestUnder(reservation.returnDate, next.pickupDate);

  // The next booking leaves no room at all — say so now rather than let
  // staff pick a date and be refused.
  if (latestReturn.getTime() <= reservation.returnDate.getTime()) {
    return { allowed: false, reason: "BOOKED_IMMEDIATELY_AFTER" };
  }

  return { allowed: true, latestReturn, limitedBy: "booking" };
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
  NOT_EXTENDABLE: "err.notExtendable",
} satisfies Record<ExtensionRefusal, TranslationKey>;

const REFUSAL_MESSAGES = {
  NOT_YET_CONFIRMED: "Confirm this request before extending it.",
  BOOKED_IMMEDIATELY_AFTER:
    "The vehicle is booked again immediately after this rental.",
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
        vehicle: { select: { pricePerDay: true } },
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
  // The raw snapshot columns stay here; the drawer gets the comparison, which
  // is null whenever there is nothing for staff to act on.
  const {
    contactFirstName,
    contactLastName,
    contactEmail,
    contactPhone,
    ...rest
  } = reservation;
  return {
    ...rest,
    timing: getReservationTiming(reservation),
    extension,
    contactDifference: reservationContactDifference({
      contactFirstName,
      contactLastName,
      contactEmail,
      contactPhone,
      customer: reservation.customer,
    }),
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
          // An overdue rental is drawn up to today however old its return is.
          OR: [{ returnDate: { gte: from } }, { status: "ACTIVE" }],
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
