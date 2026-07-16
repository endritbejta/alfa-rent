import { prisma } from "@/lib/db/prisma";

export async function getDashboardStats() {
  const [
    totalVehicles,
    availableVehicles,
    activeRentals,
    pendingRequests,
    revenue,
    recentReservations,
  ] = await prisma.$transaction([
    prisma.vehicle.count({ where: { status: { not: "INACTIVE" } } }),
    prisma.vehicle.count({ where: { status: "AVAILABLE" } }),
    prisma.reservation.count({ where: { status: "ACTIVE" } }),
    prisma.reservation.count({ where: { status: "PENDING" } }),
    prisma.reservation.aggregate({
      _sum: { totalPrice: true },
      where: { status: { in: ["ACTIVE", "COMPLETED"] } },
    }),
    prisma.reservation.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      include: {
        vehicle: { select: { brand: true, model: true, plate: true } },
        customer: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  return {
    totalVehicles,
    availableVehicles,
    activeRentals,
    pendingRequests,
    revenue: Number(revenue._sum.totalPrice ?? 0),
    recentReservations,
  };
}
