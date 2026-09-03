import { type InspectionType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  buildImageUrl,
  inspectionFolder,
  verifyUploadSignature,
} from "@/lib/cloudinary";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { getReservationTiming } from "@/lib/reservation-lifecycle";
import type { RentalInspectionInput } from "@/lib/validations/inspection";
import { reportError } from "@/lib/observability";

function expectedInspection(status: string): InspectionType | null {
  if (status === "CONFIRMED") return "PICKUP";
  if (status === "ACTIVE") return "RETURN";
  return null;
}

/**
 * Records the physical inspection and advances the rental in one transaction.
 * There is no state where a rental is marked active/completed but its required
 * condition record failed to save.
 */
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
          select: { status: true, registrationExpiry: true },
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
        `A ${reservation.status.toLowerCase()} reservation cannot be inspected`
      );
    }
    if (input.type !== expected) {
      throw new ValidationError(
        `${expected === "PICKUP" ? "Pickup" : "Return"} inspection is required`
      );
    }
    if (reservation.inspections.some((item) => item.type === input.type)) {
      throw new ConflictError(
        `${input.type === "PICKUP" ? "Pickup" : "Return"} inspection already exists`
      );
    }

    if (input.type === "PICKUP") {
      const timing = getReservationTiming(reservation, now);
      if (!timing.canStart) {
        throw new ValidationError(
          timing.startBlockedReason === "Rental window has ended"
            ? "This rental window has ended. Update the dates or cancel the reservation."
            : "The pickup inspection is available on the pickup date."
        );
      }
      if (reservation.vehicle.status !== "AVAILABLE") {
        throw new ConflictError(
          "Vehicle must be available before the handover"
        );
      }
      if (
        reservation.vehicle.registrationExpiry &&
        reservation.returnDate > reservation.vehicle.registrationExpiry
      ) {
        throw new ConflictError(
          "Renew the vehicle registration before starting this rental"
        );
      }
    } else {
      const pickup = reservation.inspections.find(
        (item) => item.type === "PICKUP"
      );
      if (pickup && input.mileage < pickup.mileage) {
        throw new ValidationError(
          `Return mileage cannot be below pickup mileage (${pickup.mileage.toLocaleString()} km)`
        );
      }
    }

    const folder = inspectionFolder(reservationId, input.type);
    for (const photo of input.photos) {
      if (
        !photo.publicId.startsWith(`${folder}/`) ||
        !verifyUploadSignature(photo)
      ) {
        throw new ValidationError(
          "An inspection photo could not be verified. Remove it and upload it again."
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
        data: { status: "ACTIVE", startedAt: now },
      });
      if (advanced.count !== 1) {
        throw new ConflictError(
          "Reservation changed while you were working. Refresh and try again."
        );
      }
      const rented = await tx.vehicle.updateMany({
        where: { id: reservation.vehicleId, status: "AVAILABLE" },
        data: { status: "RENTED" },
      });
      if (rented.count !== 1) {
        throw new ConflictError(
          "Vehicle is no longer available for this handover"
        );
      }
    } else {
      const advanced = await tx.reservation.updateMany({
        where: { id: reservationId, status: "ACTIVE" },
        data: { status: "COMPLETED", completedAt: now },
      });
      if (advanced.count !== 1) {
        throw new ConflictError(
          "Reservation changed while you were working. Refresh and try again."
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
    }

    return inspection;
  });
}
