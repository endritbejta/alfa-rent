import { Prisma, type Repair } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/errors";
import {
  businessMonthStart,
  businessYearStart,
} from "@/lib/reservation-lifecycle";
import type { RepairInput } from "@/lib/validations/repair";
import { auditFields, recordAudit } from "@/lib/audit";
import { getAuditHistory } from "@/services/audit.service";

/** A repair as the audit trail describes it, on the vehicle's history. */
function repairFields(repair: Repair) {
  return auditFields({
    repairId: repair.id,
    date: repair.date,
    cost: repair.cost,
    description: repair.description,
  });
}

export async function addRepair(
  vehicleId: string,
  input: RepairInput,
  actorId: string
): Promise<Repair> {
  return prisma.$transaction(async (tx) => {
    const vehicle = await tx.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true },
    });
    if (!vehicle) throw new NotFoundError("Vehicle");

    const repair = await tx.repair.create({
      data: {
        vehicleId,
        date: input.date,
        cost: new Prisma.Decimal(input.cost),
        description: input.description,
        notes: input.notes,
        reference: input.reference,
      },
    });
    await recordAudit(tx, {
      actorId,
      action: "vehicle.addRepair",
      entityId: vehicleId,
      after: repairFields(repair),
    });
    return repair;
  });
}

/** Recorded on the vehicle the repair belonged to, from the row itself. */
export async function deleteRepair(id: string, actorId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const repair = await tx.repair.delete({ where: { id } });
    await recordAudit(tx, {
      actorId,
      action: "vehicle.deleteRepair",
      entityId: repair.vehicleId,
      before: repairFields(repair),
    });
  });
}

/**
 * Everything the admin needs to judge whether a vehicle still earns its
 * keep: repair history plus the rolled-up spend that makes an expensive
 * car obvious at a glance.
 */
export async function getVehicleFleetProfile(vehicleId: string) {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: {
      id: true,
      brand: true,
      model: true,
      plate: true,
      year: true,
      lastServiceDate: true,
      nextServiceDate: true,
      serviceNotes: true,
      repairs: { orderBy: { date: "desc" } },
    },
  });
  if (!vehicle) throw new NotFoundError("Vehicle");

  const now = new Date();
  // Repair dates are calendar values (a picked date stored at 00:00 UTC). The
  // branch-local boundary is an instant at or before that midnight — Belgrade
  // is ahead of UTC — and after the previous day's, so comparing one with the
  // other is a comparison of calendar days. startOfYear/startOfMonth followed
  // the server's timezone instead: UTC on Vercel, Belgrade locally.
  const yearStart = businessYearStart(now);
  const monthStart = businessMonthStart(now);
  const sum = (rows: { cost: Prisma.Decimal }[]) =>
    rows.reduce((total, r) => total + Number(r.cost), 0);

  const thisYear = vehicle.repairs.filter((r) => r.date >= yearStart);
  const thisMonth = vehicle.repairs.filter((r) => r.date >= monthStart);
  const lifetime = sum(vehicle.repairs);

  return {
    vehicle,
    repairs: vehicle.repairs,
    stats: {
      totalCost: lifetime,
      count: vehicle.repairs.length,
      countThisYear: thisYear.length,
      costThisYear: sum(thisYear),
      countThisMonth: thisMonth.length,
      costThisMonth: sum(thisMonth),
      averageCost: vehicle.repairs.length
        ? lifetime / vehicle.repairs.length
        : 0,
    },
  };
}

/**
 * Reservation states whose price the car has actually earned. Narrower than
 * analytics' revenue statuses, which also count CONFIRMED: a rental that has
 * not started has earned nothing yet. Same rule as customer spend.
 */
const EARNED_STATUSES = ["ACTIVE", "COMPLETED"] as const;

/**
 * Full drawer payload for a vehicle: identity, gallery, upkeep, and the
 * financial profile that answers "is this car still worth keeping?".
 *
 * Every money figure here is aggregated in SQL over all of the car's rows.
 * `earned` used to reduce over the 12 reservations the drawer lists, so a
 * car's takings stopped growing after its twelfth rental while its costs kept
 * climbing — the exact car the owner most needs an honest number for.
 *
 * Costs are reported as what they are. Repairs are a full history; servicing
 * is only the cost of the *last* service, because services are not recorded
 * as rows. Adding the two and annualising the result produced a "per year"
 * figure that meant nothing, so only the repair history is averaged over
 * time, and "recorded costs" says plainly that it is repairs plus one service.
 */
export async function getVehicleDetail(vehicleId: string) {
  const now = new Date();
  const yearStart = businessYearStart(now);

  const [vehicle, earnedSum, repairSum, repairYearSum, history] =
    await Promise.all([
      prisma.vehicle.findUnique({
        where: { id: vehicleId },
        include: {
          images: { orderBy: { sortOrder: "asc" } },
          repairs: { orderBy: { date: "desc" } },
          // Display only — the drawer lists recent bookings. Never sum these.
          reservations: {
            where: {
              status: { in: ["PENDING", "CONFIRMED", "ACTIVE", "COMPLETED"] },
            },
            orderBy: { pickupDate: "desc" },
            take: 12,
            select: {
              id: true,
              status: true,
              pickupDate: true,
              returnDate: true,
              totalPrice: true,
              customer: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
      prisma.reservation.aggregate({
        _sum: { totalPrice: true },
        where: { vehicleId, status: { in: [...EARNED_STATUSES] } },
      }),
      prisma.repair.aggregate({
        _sum: { cost: true },
        _count: true,
        where: { vehicleId },
      }),
      prisma.repair.aggregate({
        _sum: { cost: true },
        // See getVehicleFleetProfile: calendar-dated rows against a
        // branch-local boundary.
        where: { vehicleId, date: { gte: yearStart } },
      }),
      getAuditHistory("vehicle", vehicleId),
    ]);
  if (!vehicle) throw new NotFoundError("Vehicle");

  // Summed as Decimal in the database, converted once here at the edge.
  const earned = Number(earnedSum._sum.totalPrice ?? 0);
  const repairs = Number(repairSum._sum.cost ?? 0);
  const repairsThisYear = Number(repairYearSum._sum.cost ?? 0);
  const lastService = Number(vehicle.serviceCost ?? 0);
  const recorded = repairs + lastService;

  // Months in the system, floored at 1 so a new arrival isn't divided by
  // zero. createdAt is when the car was added here, not when it was bought.
  const monthsOwned = Math.max(
    1,
    Math.round(
      (now.getTime() - vehicle.createdAt.getTime()) / (30 * 24 * 60 * 60 * 1000)
    )
  );

  return {
    vehicle,
    history,
    costs: {
      /** Cost of the most recent service only — not a history. */
      lastService,
      /** Every recorded repair, lifetime. */
      repairs,
      repairsThisYear,
      repairCount: repairSum._count,
      /** Lifetime repairs averaged over the car's time in the system. */
      repairsPerYear: (repairs / monthsOwned) * 12,
      repairsPerMonth: repairs / monthsOwned,
      /** Repairs plus the last service: everything the system has a cost for. */
      recorded,
      /** All ACTIVE and COMPLETED rentals, lifetime. */
      earned,
      net: earned - recorded,
    },
  };
}
