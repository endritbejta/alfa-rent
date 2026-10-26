import { Prisma, type Repair } from "@prisma/client";
import { startOfMonth, startOfYear } from "date-fns";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/errors";
import type { RepairInput } from "@/lib/validations/repair";

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
 * Full drawer payload for a vehicle: identity, gallery, upkeep, and the
 * financial profile that answers "is this car still worth keeping?". Service
 * cost is a separate line from repairs so upkeep never masquerades as
 * breakage.
 */
export async function getVehicleDetail(vehicleId: string) {
  const now = new Date();
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      repairs: { orderBy: { date: "desc" } },
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
  });
  if (!vehicle) throw new NotFoundError("Vehicle");

  const yearStart = startOfYear(now);
  const sum = (rows: { cost: Prisma.Decimal }[]) =>
    rows.reduce((t, r) => t + Number(r.cost), 0);

  const repairsTotal = sum(vehicle.repairs);
  const repairsYear = sum(vehicle.repairs.filter((r) => r.date >= yearStart));
  const serviceCost = Number(vehicle.serviceCost ?? 0);
  const totalCost = repairsTotal + serviceCost;

  // Months on the books, floored at 1 so a new arrival isn't divided by zero.
  const monthsOwned = Math.max(
    1,
    Math.round(
      (now.getTime() - vehicle.createdAt.getTime()) / (30 * 24 * 60 * 60 * 1000)
    )
  );

  const earned = vehicle.reservations
    .filter((r) => r.status === "ACTIVE" || r.status === "COMPLETED")
    .reduce((t, r) => t + Number(r.totalPrice), 0);

  return {
    vehicle,
    costs: {
      service: serviceCost,
      repairs: repairsTotal,
      repairsThisYear: repairsYear,
      total: totalCost,
      perYear: (totalCost / monthsOwned) * 12,
      perMonth: totalCost / monthsOwned,
      repairCount: vehicle.repairs.length,
      earned,
      net: earned - totalCost,
    },
  };
}
