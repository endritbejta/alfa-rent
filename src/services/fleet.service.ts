import { Prisma, type Repair } from "@prisma/client";
import { differenceInCalendarDays, startOfMonth, startOfYear } from "date-fns";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/errors";
import type { RepairInput } from "@/lib/validations/repair";

/** Days before expiry at which a registration starts warning. */
export const REGISTRATION_WARNING_DAYS = 30;

export type RegistrationState = "ok" | "due" | "expired" | "unknown";

export function registrationState(
  expiry: Date | null | undefined,
  today = new Date()
): { state: RegistrationState; daysLeft: number | null } {
  if (!expiry) return { state: "unknown", daysLeft: null };
  const daysLeft = differenceInCalendarDays(expiry, today);
  if (daysLeft < 0) return { state: "expired", daysLeft };
  if (daysLeft <= REGISTRATION_WARNING_DAYS) return { state: "due", daysLeft };
  return { state: "ok", daysLeft };
}

export async function addRepair(
  vehicleId: string,
  input: RepairInput
): Promise<Repair> {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true },
  });
  if (!vehicle) throw new NotFoundError("Vehicle");

  return prisma.repair.create({
    data: {
      vehicleId,
      date: input.date,
      cost: new Prisma.Decimal(input.cost),
      description: input.description,
      notes: input.notes,
      reference: input.reference,
    },
  });
}

export async function deleteRepair(id: string): Promise<void> {
  await prisma.repair.delete({ where: { id } });
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
      registrationDate: true,
      registrationExpiry: true,
      lastServiceDate: true,
      nextServiceDate: true,
      serviceNotes: true,
      repairs: { orderBy: { date: "desc" } },
    },
  });
  if (!vehicle) throw new NotFoundError("Vehicle");

  const now = new Date();
  const yearStart = startOfYear(now);
  const monthStart = startOfMonth(now);
  const sum = (rows: { cost: Prisma.Decimal }[]) =>
    rows.reduce((total, r) => total + Number(r.cost), 0);

  const thisYear = vehicle.repairs.filter((r) => r.date >= yearStart);
  const thisMonth = vehicle.repairs.filter((r) => r.date >= monthStart);
  const lifetime = sum(vehicle.repairs);

  return {
    vehicle,
    repairs: vehicle.repairs,
    registration: registrationState(vehicle.registrationExpiry, now),
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

/** Vehicles whose registration has expired or expires within the window. */
export async function getRegistrationAlerts(days = REGISTRATION_WARNING_DAYS) {
  const now = new Date();
  const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const vehicles = await prisma.vehicle.findMany({
    where: {
      status: { not: "INACTIVE" },
      registrationExpiry: { not: null, lte: horizon },
    },
    orderBy: { registrationExpiry: "asc" },
    select: {
      id: true,
      brand: true,
      model: true,
      plate: true,
      year: true,
      registrationExpiry: true,
    },
  });

  return vehicles.map((v) => ({
    ...v,
    ...registrationState(v.registrationExpiry, now),
  }));
}

/** Fleet-wide repair spend, for the analytics surface. */
export async function getFleetCostSummary() {
  const yearStart = startOfYear(new Date());
  const [all, year] = await prisma.$transaction([
    prisma.repair.aggregate({ _sum: { cost: true }, _count: { _all: true } }),
    prisma.repair.aggregate({
      _sum: { cost: true },
      _count: { _all: true },
      where: { date: { gte: yearStart } },
    }),
  ]);
  return {
    lifetimeCost: Number(all._sum.cost ?? 0),
    lifetimeCount: all._count._all,
    yearCost: Number(year._sum.cost ?? 0),
    yearCount: year._count._all,
  };
}
