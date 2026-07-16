import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { deleteAllVehicleImages } from "@/services/image.service";
import type {
  CreateVehicleInput,
  UpdateVehicleInput,
  VehicleFilterInput,
  RegistrationFilter,
} from "@/lib/validations/vehicle";
import type { VehicleStatus } from "@prisma/client";
import type { Paginated } from "@/types/api";

const vehicleWithImages = Prisma.validator<Prisma.VehicleDefaultArgs>()({
  include: { images: { orderBy: { sortOrder: "asc" as const } } },
});

export type VehicleWithImages = Prisma.VehicleGetPayload<
  typeof vehicleWithImages
>;

function slugify(brand: string, model: string, year: number): string {
  return `${brand}-${model}-${year}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Turn a registration filter into a date predicate. */
function registrationWhere(
  registration: RegistrationFilter | undefined,
  warningDays = 30
): Prisma.VehicleWhereInput {
  if (!registration) return {};
  const now = new Date();
  const horizon = new Date(now.getTime() + warningDays * 24 * 60 * 60 * 1000);
  switch (registration) {
    case "expired":
      return { registrationExpiry: { lt: now } };
    case "due":
      return { registrationExpiry: { gte: now, lte: horizon } };
    case "valid":
      return { registrationExpiry: { gt: horizon } };
    case "missing":
      return { registrationExpiry: null };
  }
}

export async function getVehicles(
  filters: VehicleFilterInput,
  opts: {
    includeInactive?: boolean;
    brand?: string;
    /** Admin-only: the public listing must never filter by these. */
    status?: VehicleStatus;
    registration?: RegistrationFilter;
  } = {}
): Promise<Paginated<VehicleWithImages>> {
  const {
    page,
    perPage,
    category,
    transmission,
    minPrice,
    maxPrice,
    from,
    to,
  } = filters;

  const where: Prisma.VehicleWhereInput = {
    ...(opts.status
      ? { status: opts.status }
      : opts.includeInactive
        ? {}
        : { status: { not: "INACTIVE" as const } }),
    ...(opts.brand && { brand: { equals: opts.brand, mode: "insensitive" } }),
    ...registrationWhere(opts.registration),
    ...(category && { category }),
    ...(transmission && { transmission }),
    ...((minPrice !== undefined || maxPrice !== undefined) && {
      pricePerDay: {
        ...(minPrice !== undefined && { gte: minPrice }),
        ...(maxPrice !== undefined && { lte: maxPrice }),
      },
    }),
    ...(from &&
      to &&
      to > from && {
        reservations: {
          none: {
            status: { in: ["CONFIRMED", "ACTIVE"] },
            pickupDate: { lt: to },
            returnDate: { gt: from },
          },
        },
      }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.vehicle.findMany({
      where,
      ...vehicleWithImages,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.vehicle.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    perPage,
    totalPages: Math.ceil(total / perPage),
  };
}

export async function getVehicleById(id: string): Promise<VehicleWithImages> {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    ...vehicleWithImages,
  });
  if (!vehicle) throw new NotFoundError("Vehicle");
  return vehicle;
}

export async function getVehicleBySlug(
  slug: string
): Promise<VehicleWithImages> {
  const vehicle = await prisma.vehicle.findUnique({
    where: { slug },
    ...vehicleWithImages,
  });
  if (!vehicle) throw new NotFoundError("Vehicle");
  return vehicle;
}

export async function createVehicle(
  input: CreateVehicleInput
): Promise<VehicleWithImages> {
  return prisma.vehicle.create({
    data: { ...input, slug: slugify(input.brand, input.model, input.year) },
    ...vehicleWithImages,
  });
}

export async function updateVehicle(
  id: string,
  input: UpdateVehicleInput
): Promise<VehicleWithImages> {
  const current = await getVehicleById(id);
  const brand = input.brand ?? current.brand;
  const model = input.model ?? current.model;
  const year = input.year ?? current.year;

  return prisma.vehicle.update({
    where: { id },
    data: { ...input, slug: slugify(brand, model, year) },
    ...vehicleWithImages,
  });
}

export async function deleteVehicle(id: string): Promise<void> {
  const activeCount = await prisma.reservation.count({
    where: {
      vehicleId: id,
      status: { in: ["PENDING", "CONFIRMED", "ACTIVE"] },
    },
  });
  if (activeCount > 0) {
    throw new ConflictError(
      "Vehicle has open reservations. Cancel or complete them first, or set the vehicle to INACTIVE."
    );
  }
  // Completed/cancelled history is preserved by soft-retiring instead of
  // deleting when any reservations exist at all.
  const historyCount = await prisma.reservation.count({
    where: { vehicleId: id },
  });
  if (historyCount > 0) {
    await prisma.vehicle.update({
      where: { id },
      data: { status: "INACTIVE" },
    });
    return;
  }
  // Hard delete: clear Cloudinary assets first — the DB cascade only
  // removes the rows, not the hosted files.
  await deleteAllVehicleImages(id);
  await prisma.vehicle.delete({ where: { id } });
}

/** Distinct brands in the fleet, for the admin filter dropdown. */
export async function getVehicleBrands(): Promise<string[]> {
  const rows = await prisma.vehicle.findMany({
    distinct: ["brand"],
    orderBy: { brand: "asc" },
    select: { brand: true },
  });
  return rows.map((r) => r.brand);
}
