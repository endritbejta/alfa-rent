import { Prisma, type InspectionType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  buildImageUrl,
  inspectionFolder,
  verifyUploadSignature,
} from "@/lib/cloudinary";
import {
  ConflictError,
  NotFoundError,
  phrase,
  ValidationError,
} from "@/lib/errors";
import { RESERVATION_STATUS_KEYS } from "@/lib/status-labels";
import { getReservationTiming } from "@/lib/reservation-lifecycle";
import {
  businessDay,
  recordedRentalInstant,
  rentalCalendarDay,
} from "@/lib/business-time";
import type {
  LateReturnInput,
  PastRentalInput,
  RentalInspectionInput,
} from "@/lib/validations/inspection";
import { reportError } from "@/lib/observability";
import { auditFields, recordAudit, type AuditEventInput } from "@/lib/audit";
import { lateReturnDays } from "@/lib/late-return";
import { additionalDaysCharge } from "@/lib/pricing";

function expectedInspection(status: string): InspectionType | null {
  if (status === "CONFIRMED") return "PICKUP";
  if (status === "ACTIVE") return "RETURN";
  return null;
}

/**
 * The instant to store as `startedAt` / `completedAt`.
 *
 * Bounded so a backdated record can't contradict the rest: a handover not
 * before the pickup day, a return not before the handover, neither in the
 * future. The scheduled dates are never touched, so the exclusion
 * constraint, revenue (which follows the booked days) and the overdue
 * counts all keep reading the booking as it was made.
 */
function resolveOccurredAt(
  reservation: {
    pickupDate: Date;
    returnDate: Date;
    startedAt: Date | null;
  },
  input: Pick<RentalInspectionInput, "type" | "occurredOn">,
  now: Date
): Date {
  const day = input.occurredOn;
  if (!day) return now;
  if (day > businessDay(now)) {
    throw new ValidationError("That date is in the future.", {
      key: "err.occurredInFuture",
    });
  }
  if (input.type === "PICKUP") {
    if (day < rentalCalendarDay(reservation.pickupDate)) {
      throw new ValidationError(
        "The handover cannot be before the pickup date.",
        { key: "err.handoverBeforePickup" }
      );
    }
    return recordedRentalInstant(day, reservation.pickupDate, now);
  }
  const startedAt = reservation.startedAt;
  if (startedAt && day < businessDay(startedAt)) {
    throw new ValidationError("The return cannot be before the handover.", {
      key: "err.returnBeforeHandover",
    });
  }
  const at = recordedRentalInstant(day, reservation.returnDate, now);
  // Same day as the handover but an earlier scheduled hour: the return
  // can't precede the start, so it lands on the start.
  return startedAt && at < startedAt ? startedAt : at;
}

/**
 * Settles a return after the booked return day (audit P2-4): staff either
 * charge the extra days or waive them with a reason. Nothing is asked of an
 * on-time return.
 *
 * The booked dates stay as they were. Charging adds to `totalPrice` and
 * records the days beside the booking, so it can never trip the exclusion
 * constraint — the late days are the ones most likely to overlap the car's
 * next booking — and the overdue counts, the calendar and the punctuality
 * record keep reading the booking as made. Revenue per rental day spreads
 * `lateCharge` over the late days themselves; see analytics' revenueByBucket.
 *
 * The extra days are priced as an extension would price them: the car's
 * rate today, in Decimal, through the same helper.
 *
 * Returns the columns to write with the completion and the audit event that
 * records the decision, or nothing when there is nothing to settle.
 */
function settleLateReturn(
  reservation: {
    id: string;
    returnDate: Date;
    totalPrice: Prisma.Decimal;
    vehicle: { pricePerDay: Prisma.Decimal };
  },
  returnedOn: string,
  choice: LateReturnInput | undefined,
  actorId: string
): {
  data: Prisma.ReservationUpdateManyMutationInput;
  event: AuditEventInput | null;
} {
  const days = lateReturnDays(
    rentalCalendarDay(reservation.returnDate),
    returnedOn
  );
  if (days === 0) return { data: {}, event: null };
  if (!choice) {
    throw new ValidationError(
      `This car came back ${days} day(s) after its return date. Charge the extra days or waive them with a reason.`,
      { key: "err.lateReturnUnresolved", values: { days } }
    );
  }
  if (choice.resolution === "WAIVE") {
    return {
      data: {
        lateDays: days,
        lateCharge: new Prisma.Decimal(0),
        lateResolution: "WAIVED",
        lateWaiverReason: choice.reason,
      },
      event: {
        actorId,
        action: "reservation.lateWaive",
        entityId: reservation.id,
        after: auditFields({ lateDays: days, lateResolution: "WAIVED" }),
        // Free text that may name the customer: kept in `reason`, which
        // anonymisation scrubs, and never in `after`.
        reason: choice.reason,
      },
    };
  }
  // The dialog showed a number; charging any other would be charging
  // something staff never confirmed.
  if (choice.days !== days) {
    throw new ValidationError(
      `The return is ${days} day(s) late, not ${choice.days}. Check the return date and confirm again.`,
      { key: "err.lateDaysChanged", values: { days } }
    );
  }
  const lateCharge = additionalDaysCharge(
    reservation.vehicle.pricePerDay,
    days
  );
  const totalPrice = reservation.totalPrice.add(lateCharge);
  return {
    data: { lateDays: days, lateCharge, lateResolution: "CHARGED", totalPrice },
    event: {
      actorId,
      action: "reservation.lateCharge",
      entityId: reservation.id,
      before: auditFields({ totalPrice: reservation.totalPrice }),
      after: auditFields({
        lateDays: days,
        pricePerDay: reservation.vehicle.pricePerDay,
        lateCharge,
        totalPrice,
      }),
    },
  };
}

/**
 * Records the physical inspection and advances the rental in one transaction.
 * There is no state where a rental is marked active/completed but its required
 * condition record failed to save.
 */
/** Odometer reading recorded when the vehicle left, or null if none yet. */
export async function getPickupMileage(
  reservationId: string
): Promise<number | null> {
  const pickup = await prisma.rentalInspection.findUnique({
    where: { reservationId_type: { reservationId, type: "PICKUP" } },
    select: { mileage: true },
  });
  return pickup?.mileage ?? null;
}

export async function recordRentalInspection(
  reservationId: string,
  createdById: string,
  input: RentalInspectionInput,
  now = new Date()
) {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
      include: {
        vehicle: {
          select: { status: true, pricePerDay: true },
        },
        inspections: {
          select: { type: true, mileage: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!reservation) throw new NotFoundError("Reservation");

    const expected = expectedInspection(reservation.status);
    if (!expected) {
      throw new ValidationError(
        `A ${reservation.status.toLowerCase()} reservation cannot be inspected`,
        {
          key: "err.notInspectable",
          values: {
            status: phrase(RESERVATION_STATUS_KEYS[reservation.status]),
          },
        }
      );
    }
    if (input.type !== expected) {
      throw new ValidationError(
        `${expected === "PICKUP" ? "Pickup" : "Return"} inspection is required`,
        {
          key:
            expected === "PICKUP"
              ? "err.pickupInspectionRequired"
              : "err.returnInspectionRequired",
        }
      );
    }
    if (reservation.inspections.some((item) => item.type === input.type)) {
      throw new ConflictError(
        `${input.type === "PICKUP" ? "Pickup" : "Return"} inspection already exists`,
        {
          key:
            input.type === "PICKUP"
              ? "err.pickupInspectionExists"
              : "err.returnInspectionExists",
        }
      );
    }

    if (input.type === "PICKUP") {
      const timing = getReservationTiming(reservation, now);
      // Never before the pickup day: the car is promised from that day, and
      // the exclusion constraint only knows the scheduled range.
      if (!timing.canStart) {
        throw new ValidationError(
          "The pickup inspection is available on the pickup date.",
          { key: "err.pickupOnPickupDate" }
        );
      }
      // After it, a start is a late one and must be confirmed as such —
      // including once the whole window has passed, which used to be
      // refused outright even though the rental had happened.
      if (timing.lateStart && !input.lateStartConfirmed) {
        throw new ValidationError(
          "The pickup date has passed. Confirm the late handover to start this rental.",
          { key: "err.lateStartUnconfirmed" }
        );
      }
      if (reservation.vehicle.status !== "AVAILABLE") {
        throw new ConflictError(
          "Vehicle must be available before the handover",
          { key: "err.vehicleMustBeAvailable" }
        );
      }
    } else {
      const pickup = reservation.inspections.find(
        (item) => item.type === "PICKUP"
      );
      if (pickup && input.mileage < pickup.mileage) {
        throw new ValidationError(
          `Return mileage cannot be below pickup mileage (${pickup.mileage.toLocaleString()} km)`,
          {
            key: "err.mileageBelowPickup",
            // Grouped by the reader's locale at the boundary, not by the
            // server's default — toLocaleString() here is for the log line.
            values: { km: pickup.mileage },
          }
        );
      }
    }

    // When it actually happened. Today (or no day given) is now; an earlier
    // day is a handover or return being recorded after the fact.
    const occurredAt = resolveOccurredAt(reservation, input, now);

    const folder = inspectionFolder(reservationId, input.type);
    for (const photo of input.photos) {
      if (
        !photo.publicId.startsWith(`${folder}/`) ||
        !verifyUploadSignature(photo)
      ) {
        throw new ValidationError(
          "An inspection photo could not be verified. Remove it and upload it again.",
          { key: "err.inspectionPhotoUnverified" }
        );
      }
    }

    const inspection = await tx.rentalInspection.create({
      data: {
        reservationId,
        createdById,
        type: input.type,
        mileage: input.mileage,
        fuelLevel: input.fuelLevel,
        exteriorNotes: input.exteriorNotes,
        interiorNotes: input.interiorNotes,
        damageFound: input.damageFound,
        damageNotes: input.damageNotes,
        signerName: input.signerName,
        acknowledgedAt: now,
        photos: {
          create: input.photos.map((photo, index) => ({
            publicId: photo.publicId,
            url: buildImageUrl(photo.publicId, photo.version),
            sortOrder: index,
          })),
        },
      },
      include: { photos: true },
    });

    if (input.type === "PICKUP") {
      const advanced = await tx.reservation.updateMany({
        where: { id: reservationId, status: "CONFIRMED" },
        data: { status: "ACTIVE", startedAt: occurredAt },
      });
      if (advanced.count !== 1) {
        throw new ConflictError(
          "Reservation changed while you were working. Refresh and try again.",
          { key: "err.changedUnderYou" }
        );
      }
      const rented = await tx.vehicle.updateMany({
        where: { id: reservation.vehicleId, status: "AVAILABLE" },
        data: { status: "RENTED" },
      });
      if (rented.count !== 1) {
        throw new ConflictError(
          "Vehicle is no longer available for this handover",
          { key: "err.vehicleNoLongerAvailable" }
        );
      }
      await recordAudit(tx, {
        actorId: createdById,
        action: "reservation.start",
        entityId: reservationId,
        before: { status: "CONFIRMED" },
        after: auditFields({
          status: "ACTIVE",
          startedAt: occurredAt,
          lateStart: input.lateStartConfirmed === true,
          mileage: input.mileage,
          fuelLevel: input.fuelLevel,
          damageFound: input.damageFound,
          vehicleStatus: "RENTED",
        }),
      });
    } else {
      // The business day it came back: the dated one, or today.
      const late = settleLateReturn(
        reservation,
        input.occurredOn ?? businessDay(now),
        input.lateReturn,
        createdById
      );
      const advanced = await tx.reservation.updateMany({
        // The return date too: an extension in the meantime changes both
        // the late days and the total this was priced from.
        where: {
          id: reservationId,
          status: "ACTIVE",
          returnDate: reservation.returnDate,
        },
        data: { status: "COMPLETED", completedAt: occurredAt, ...late.data },
      });
      if (advanced.count !== 1) {
        throw new ConflictError(
          "Reservation changed while you were working. Refresh and try again.",
          { key: "err.changedUnderYou" }
        );
      }
      /**
       * Deliberately not guarded the way the PICKUP branch above is: the car
       * is physically back, so the return must always be recorded. If staff
       * moved the vehicle to SERVICE mid-rental it should stay there — the
       * filter is what keeps a deliberate off-road state from being clobbered.
       *
       * A miss is still worth knowing about, because it is the only way a
       * vehicle leaves an active rental without returning to the fleet, and
       * nothing else reconciles that.
       */
      const released = await tx.vehicle.updateMany({
        where: { id: reservation.vehicleId, status: "RENTED" },
        data: { status: "AVAILABLE" },
      });
      if (released.count !== 1) {
        reportError(
          new Error("Vehicle was not RENTED at return; status left unchanged"),
          {
            scope: "inspection-return",
            reservationId,
            vehicleId: reservation.vehicleId,
          }
        );
      }
      await recordAudit(tx, {
        actorId: createdById,
        action: "reservation.complete",
        entityId: reservationId,
        before: { status: "ACTIVE" },
        after: auditFields({
          status: "COMPLETED",
          completedAt: occurredAt,
          mileage: input.mileage,
          fuelLevel: input.fuelLevel,
          damageFound: input.damageFound,
          ...(released.count === 1 && { vehicleStatus: "AVAILABLE" }),
        }),
      });
      if (late.event) await recordAudit(tx, late.event);
    }

    return inspection;
  });
}

/** Statuses whose scheduled days a car really spent (or will spend) out. */
const OCCUPYING_STATUSES = ["CONFIRMED", "ACTIVE", "COMPLETED"] as const;

/**
 * Records a whole rental that happened but was never started in the system:
 * staff forgot to press Start, and by now its return day has passed too.
 * One step instead of two inspections nobody can fill in after the fact.
 *
 * What it deliberately does not do:
 * - Touch the vehicle's status. That describes the car now; this rental is
 *   over. The handover path's "must be AVAILABLE" rule would otherwise
 *   refuse every past rental of a car that is out again today, and force
 *   several past rentals of one car to be entered strictly in order.
 * - Create inspections. There was no recorded inspection, and inventing
 *   one (mileage 0, a signature nobody gave) would corrupt the record. The
 *   reason goes in `backfillNote` instead.
 * - Change the booked dates. The exclusion constraint, revenue (per booked
 *   day) and the overdue counts keep reading the booking as made. A return
 *   after the booked one is settled like any late return (charged or
 *   waived; see settleLateReturn), beside the booking, not by moving it.
 *
 * What it keeps: never before the pickup day, never in the future, the
 * CONFIRMED-only transition guard, and no actual return that runs into the
 * car's next booking. `backfilledAt` / `backfilledById` / `backfillNote`
 * are the audit trace that it was entered this way.
 */
export async function recordPastRental(
  reservationId: string,
  userId: string,
  input: PastRentalInput,
  now = new Date()
) {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
      include: { vehicle: { select: { pricePerDay: true } } },
    });
    if (!reservation) throw new NotFoundError("Reservation");

    const timing = getReservationTiming(reservation, now);
    if (!timing.canRecordPast) {
      throw new ValidationError(
        "Only a confirmed rental whose return date has passed can be recorded after the fact.",
        { key: "err.pastRentalNotOver" }
      );
    }
    const { startedOn, returnedOn } = input;
    if (startedOn > timing.today || returnedOn > timing.today) {
      throw new ValidationError("That date is in the future.", {
        key: "err.occurredInFuture",
      });
    }
    if (startedOn < timing.pickupDay) {
      throw new ValidationError(
        "The handover cannot be before the pickup date.",
        { key: "err.handoverBeforePickup" }
      );
    }
    if (returnedOn < startedOn) {
      throw new ValidationError("The return cannot be before the handover.", {
        key: "err.returnBeforeHandover",
      });
    }

    const startedAt = recordedRentalInstant(
      startedOn,
      reservation.pickupDate,
      now
    );
    const returnedAt = recordedRentalInstant(
      returnedOn,
      reservation.returnDate,
      now
    );
    const completedAt = returnedAt < startedAt ? startedAt : returnedAt;

    // Kept late past its booked return: the car can't also have been out on
    // its next booking. The constraint only sees booked ranges, so this is
    // the one overlap it could not catch.
    if (returnedOn > timing.returnDay) {
      const next = await tx.reservation.findFirst({
        where: {
          id: { not: reservation.id },
          vehicleId: reservation.vehicleId,
          status: { in: [...OCCUPYING_STATUSES] },
          pickupDate: { gte: reservation.returnDate, lt: completedAt },
        },
        orderBy: { pickupDate: "asc" },
        select: { pickupDate: true },
      });
      if (next) {
        const from = rentalCalendarDay(next.pickupDate);
        throw new ConflictError(
          `This car was booked again from ${from}, so it cannot have come back on ${returnedOn}.`,
          {
            key: "err.backfillOverlapsNext",
            values: { from, until: returnedOn },
          }
        );
      }
    }

    // Back after the booked return day: settled here exactly as at a
    // normal return, so recording it after the fact is no way around it.
    const late = settleLateReturn(
      reservation,
      returnedOn,
      input.lateReturn,
      userId
    );

    const recorded = await tx.reservation.updateMany({
      where: {
        id: reservationId,
        status: "CONFIRMED",
        returnDate: reservation.returnDate,
      },
      data: {
        status: "COMPLETED",
        startedAt,
        completedAt,
        backfilledAt: now,
        backfilledById: userId,
        backfillNote: input.note,
        ...late.data,
      },
    });
    if (recorded.count !== 1) {
      throw new ConflictError(
        "Reservation changed while you were working. Refresh and try again.",
        { key: "err.changedUnderYou" }
      );
    }
    // The note is why the inspections are missing: the event's reason.
    await recordAudit(tx, {
      actorId: userId,
      action: "reservation.recordPast",
      entityId: reservationId,
      before: { status: "CONFIRMED" },
      after: auditFields({ status: "COMPLETED", startedAt, completedAt }),
      reason: input.note,
    });
    if (late.event) await recordAudit(tx, late.event);
  });
}
