import { Prisma, type Repair, type VehicleService } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  businessMonthStartAsRentalDate,
  businessTodayAsRentalDate,
  businessYearStartAsRentalDate,
} from "@/lib/business-time";
import type { RepairInput } from "@/lib/validations/repair";
import type { VehicleServiceInput } from "@/lib/validations/vehicle-service";
import { auditFields, diffFields, recordAudit } from "@/lib/audit";
import {
  historyStartDay,
  monthsOfHistory,
  vehicleCosts,
} from "@/lib/vehicle-costs";
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

/** A service as the audit trail describes it, on the vehicle's history. */
function serviceFields(service: VehicleService) {
  return auditFields({
    serviceId: service.id,
    date: service.date,
    cost: service.cost,
    mileage: service.mileage,
  });
}

/**
 * A service is history: it has happened. One booked for next month is what
 * nextServiceDate is for, and counting it now would put a cost on the car
 * before it is paid and make it "the last service" before it is done.
 */
function assertNotInFuture(date: Date, now: Date) {
  if (date > businessTodayAsRentalDate(now)) {
    throw new ValidationError("A service cannot be dated in the future", {
      key: "err.serviceInFuture",
    });
  }
}

/**
 * The columns a service input writes. Optional fields become `null`, never
 * `undefined`: in an update, undefined means "leave unchanged", so a mileage
 * the operator cleared would silently survive.
 */
function serviceData(input: VehicleServiceInput) {
  return {
    date: input.date,
    cost: new Prisma.Decimal(input.cost),
    mileage: input.mileage ?? null,
    notes: input.notes || null,
  };
}

export async function addVehicleService(
  vehicleId: string,
  input: VehicleServiceInput,
  actorId: string,
  now = new Date()
): Promise<VehicleService> {
  assertNotInFuture(input.date, now);
  return prisma.$transaction(async (tx) => {
    const vehicle = await tx.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true },
    });
    if (!vehicle) throw new NotFoundError("Vehicle");

    const service = await tx.vehicleService.create({
      data: { vehicleId, createdById: actorId, ...serviceData(input) },
    });
    await recordAudit(tx, {
      actorId,
      action: "vehicle.addService",
      entityId: vehicleId,
      after: serviceFields(service),
    });
    return service;
  });
}

/**
 * Edits a service of this vehicle. The vehicle id is part of the lookup, so
 * a service id from another car is "not found" rather than editable through
 * this one. A save that changes nothing writes nothing and records nothing.
 */
export async function updateVehicleService(
  vehicleId: string,
  serviceId: string,
  input: VehicleServiceInput,
  actorId: string,
  now = new Date()
): Promise<VehicleService> {
  assertNotInFuture(input.date, now);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.vehicleService.findFirst({
      where: { id: serviceId, vehicleId },
    });
    if (!existing) throw new NotFoundError("Record");

    const data = serviceData(input);
    const diff = diffFields(existing, data);
    if (!diff) return existing;

    const service = await tx.vehicleService.update({
      where: { id: serviceId },
      data,
    });
    await recordAudit(tx, {
      actorId,
      action: "vehicle.updateService",
      entityId: vehicleId,
      before: { serviceId, ...diff.before },
      after: { serviceId, ...diff.after },
    });
    return service;
  });
}

/** Recorded on the vehicle, from the row itself. */
export async function deleteVehicleService(
  vehicleId: string,
  serviceId: string,
  actorId: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.vehicleService.findFirst({
      where: { id: serviceId, vehicleId },
    });
    if (!existing) throw new NotFoundError("Record");
    await tx.vehicleService.delete({ where: { id: serviceId } });
    await recordAudit(tx, {
      actorId,
      action: "vehicle.deleteService",
      entityId: vehicleId,
      before: serviceFields(existing),
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
      repairs: { orderBy: { date: "desc" } },
      // Only the newest: the edit form shows when the car was last serviced.
      services: {
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: { date: true },
      },
    },
  });
  if (!vehicle) throw new NotFoundError("Vehicle");

  const now = new Date();
  // Repair dates are calendar values (a picked date stored at 00:00 UTC), so
  // they are compared with calendar boundaries of the branch's current year
  // and month — not with instants, and not with startOfYear/startOfMonth,
  // which follow the server's time zone (UTC on Vercel, Belgrade locally).
  const yearStart = businessYearStartAsRentalDate(now);
  const monthStart = businessMonthStartAsRentalDate(now);
  const sum = (rows: { cost: Prisma.Decimal }[]) =>
    rows.reduce((total, r) => total + Number(r.cost), 0);

  const thisYear = vehicle.repairs.filter((r) => r.date >= yearStart);
  const thisMonth = vehicle.repairs.filter((r) => r.date >= monthStart);
  const lifetime = sum(vehicle.repairs);

  return {
    vehicle,
    repairs: vehicle.repairs,
    lastServiceDate: vehicle.services[0]?.date ?? null,
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
 * Costs are every repair plus every service (audit P2-5c). Services used to
 * be one pair of columns holding only the *last* one, so each new service
 * erased the cost of the one before from the car's figures; they are rows
 * now, and "last service" is simply the newest. The maths, including when
 * the per-year average is too early to show, is in lib/vehicle-costs.ts.
 */
export async function getVehicleDetail(vehicleId: string, now = new Date()) {
  const yearStart = businessYearStartAsRentalDate(now);

  const [
    vehicle,
    earnedSum,
    repairSum,
    repairYearSum,
    serviceSum,
    serviceYearSum,
    history,
  ] = await Promise.all([
    prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: {
        images: { orderBy: { sortOrder: "asc" } },
        repairs: { orderBy: { date: "desc" } },
        // Newest first: the first row is the last service. createdAt breaks
        // a tie between two services on one day.
        services: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] },
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
      _min: { date: true },
      _count: true,
      where: { vehicleId },
    }),
    prisma.repair.aggregate({
      _sum: { cost: true },
      // See getVehicleFleetProfile: calendar-dated rows against a
      // calendar boundary.
      where: { vehicleId, date: { gte: yearStart } },
    }),
    prisma.vehicleService.aggregate({
      _sum: { cost: true },
      _min: { date: true },
      _count: true,
      where: { vehicleId },
    }),
    prisma.vehicleService.aggregate({
      _sum: { cost: true },
      where: { vehicleId, date: { gte: yearStart } },
    }),
    getAuditHistory("vehicle", vehicleId),
  ]);
  if (!vehicle) throw new NotFoundError("Vehicle");

  // Summed as Decimal in the database, converted once here at the edge.
  const earned = Number(earnedSum._sum.totalPrice ?? 0);
  const repairs = Number(repairSum._sum.cost ?? 0);
  const services = Number(serviceSum._sum.cost ?? 0);
  const thisYear =
    Number(repairYearSum._sum.cost ?? 0) +
    Number(serviceYearSum._sum.cost ?? 0);

  const since = historyStartDay(vehicle.createdAt, [
    repairSum._min.date,
    serviceSum._min.date,
  ]);
  const months = monthsOfHistory(since, now);
  const figures = vehicleCosts({ earned, repairs, services, months });
  const last = vehicle.services[0] ?? null;

  return {
    vehicle,
    history,
    costs: {
      /** The newest service row, or null when none is recorded. */
      lastService: last ? { date: last.date, cost: Number(last.cost) } : null,
      /** Every recorded service, lifetime. */
      services,
      serviceCount: serviceSum._count,
      /** Every recorded repair, lifetime. */
      repairs,
      repairCount: repairSum._count,
      /** Repairs and services dated in the branch's current calendar year. */
      thisYear,
      /** The calendar day the averages run from. */
      since,
      /** Recorded costs averaged per month/year; null under three months. */
      perMonth: figures.perMonth,
      perYear: figures.perYear,
      /** Every repair plus every service. */
      recorded: figures.recorded,
      /** All ACTIVE and COMPLETED rentals, lifetime. */
      earned,
      net: figures.net,
    },
  };
}
