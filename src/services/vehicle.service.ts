import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { deleteImage } from "@/lib/cloudinary";
import { reportError } from "@/lib/observability";
import type {
  CreateVehicleInput,
  UpdateVehicleInput,
  VehicleFilterInput,
  RegistrationFilter,
} from "@/lib/validations/vehicle";
import type { VehicleStatus } from "@prisma/client";
import type { Paginated } from "@/types/api";
import { PUBLIC_BOOKABLE_VEHICLE_STATUSES } from "@/lib/vehicle-policy";

const vehicleWithImages = Prisma.validator<Prisma.VehicleDefaultArgs>()({
  include: { images: { orderBy: { sortOrder: "asc" as const } } },
});

export type VehicleWithImages = Prisma.VehicleGetPayload<
  typeof vehicleWithImages
>;

/**
 * What an anonymous visitor is allowed to see.
 *
 * An explicit allowlist, not `include`: with `include`, every column added
 * to the model would be published automatically — which is exactly how
 * registration and service costs ended up on the public API. Adding a
 * column here now has to be a deliberate act.
 */
const publicVehicleSelect = Prisma.validator<Prisma.VehicleSelectScalar>()({
  id: true,
  slug: true,
  brand: true,
  model: true,
  year: true,
  category: true,
  transmission: true,
  fuelType: true,
  seats: true,
  pricePerDay: true,
  description: true,
  status: true,
});

const publicVehicleArgs = Prisma.validator<Prisma.VehicleDefaultArgs>()({
  select: {
    ...publicVehicleSelect,
    images: {
      orderBy: { sortOrder: "asc" as const },
      select: { id: true, url: true },
    },
  },
});

export type PublicVehicle = Prisma.VehicleGetPayload<typeof publicVehicleArgs>;

/** The allowlist, exposed so a test can assert nothing sensitive creeps in. */
export const publicVehicleFields = Object.keys(publicVehicleSelect);

function slugify(
  brand: string,
  model: string,
  year: number,
  identity: string
): string {
  return `${brand}-${model}-${year}-${identity}`
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

type VehicleReadOpts = {
  includeInactive?: boolean;
  brand?: string;
  /** Admin-only: the public listing must never filter by these. */
  status?: VehicleStatus;
  registration?: RegistrationFilter;
};

/** Shared by the admin and public reads so their filtering cannot drift. */
function buildVehicleWhere(
  filters: VehicleFilterInput,
  opts: VehicleReadOpts
): Prisma.VehicleWhereInput {
  const { q, category, transmission, minPrice, maxPrice, from, to } = filters;
  return {
    ...(opts.status
      ? { status: opts.status }
      : opts.includeInactive
        ? {}
        : { status: { not: "INACTIVE" as const } }),
    ...(opts.brand && { brand: { equals: opts.brand, mode: "insensitive" } }),
    ...registrationWhere(opts.registration),
    ...(q && {
      OR: [
        { brand: { contains: q, mode: "insensitive" } },
        { model: { contains: q, mode: "insensitive" } },
      ],
    }),
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
}

function buildPublicVehicleWhere(
  filters: VehicleFilterInput
): Prisma.VehicleWhereInput {
  return {
    ...buildVehicleWhere(filters, { includeInactive: true }),
    status: { in: [...PUBLIC_BOOKABLE_VEHICLE_STATUSES] },
    ...(filters.to && {
      OR: [
        { registrationExpiry: null },
        { registrationExpiry: { gte: filters.to } },
      ],
    }),
  };
}

export async function getVehicles(
  filters: VehicleFilterInput,
  opts: VehicleReadOpts = {}
): Promise<Paginated<VehicleWithImages>> {
  const { page, perPage } = filters;
  const where = buildVehicleWhere(filters, opts);

  const [items, total] = await prisma.$transaction([
    prisma.vehicle.findMany({
      where,
      ...vehicleWithImages,
      orderBy:
        filters.sort === "price-asc"
          ? { pricePerDay: "asc" }
          : filters.sort === "price-desc"
            ? { pricePerDay: "desc" }
            : { createdAt: "desc" },
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

export async function createVehicle(
  input: CreateVehicleInput
): Promise<VehicleWithImages> {
  // The identity suffix allows multiple same-model vehicles and remains
  // stable when display fields are edited. A plate is ideal; vehicles
  // without one receive a non-guessable short identity.
  const identity = input.plate ?? randomUUID().slice(0, 8);
  return prisma.vehicle.create({
    data: {
      ...input,
      slug: slugify(input.brand, input.model, input.year, identity),
    },
    ...vehicleWithImages,
  });
}

/**
 * Statuses an operator may choose directly.
 *
 * `RENTED` is absent on purpose: it means "a rental is out", which is a fact
 * about a reservation, not an attribute someone types in. Only the pickup
 * handover sets it, and only the return clears it.
 */
const OPERATOR_SETTABLE_STATUSES: VehicleStatus[] = [
  "AVAILABLE",
  "SERVICE",
  "INACTIVE",
];

/**
 * Guards the one column on this model that is a second source of truth.
 *
 * `Vehicle.status` duplicates something the reservations already say, and it
 * had three writers with three different rules — the handover, the soft
 * retire, and this update, which wrote whatever it was handed. That let an
 * admin mark a car AVAILABLE while it was out on rental, after which the
 * return could not release it and the car could end up off the fleet with
 * nothing reporting it.
 *
 * Only a *change* is checked: saving an unrelated field on a rented car must
 * keep working, and the form posts `status` on every submit.
 */
async function assertStatusChangeAllowed(
  id: string,
  current: VehicleStatus,
  next: VehicleStatus
) {
  if (next === current) return;

  if (!OPERATOR_SETTABLE_STATUSES.includes(next)) {
    throw new ValidationError(
      "A vehicle becomes rented when its pickup inspection is recorded, not by being set here."
    );
  }

  const openCount = await prisma.reservation.count({
    where: {
      vehicleId: id,
      status: { in: ["PENDING", "CONFIRMED", "ACTIVE"] },
    },
  });
  const activeCount = await prisma.reservation.count({
    where: { vehicleId: id, status: "ACTIVE" },
  });

  // The car is physically out. Calling it available would contradict the
  // rental and strand it: the return releases only a RENTED vehicle.
  if (next === "AVAILABLE" && activeCount > 0) {
    throw new ConflictError(
      "This vehicle is out on an active rental. Complete the return inspection before marking it available."
    );
  }

  // Matches deleteVehicle, which already refuses to retire a vehicle with
  // commitments against it.
  if (next === "INACTIVE" && openCount > 0) {
    throw new ConflictError(
      "This vehicle has open reservations. Cancel or complete them before retiring it."
    );
  }
}

export async function updateVehicle(
  id: string,
  input: UpdateVehicleInput
): Promise<VehicleWithImages> {
  if (input.status) {
    const existing = await prisma.vehicle.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!existing) throw new NotFoundError("Vehicle");
    await assertStatusChangeAllowed(id, existing.status, input.status);
  }

  return prisma.vehicle.update({
    where: { id },
    data: input,
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
  /*
   * Row first, hosted files second.
   *
   * The previous order destroyed every Cloudinary asset and *then* deleted the
   * vehicle — and that delete can fail: Reservation.vehicleId is
   * onDelete: Restrict, and a public booking landing between the counts above
   * and this point raises a foreign-key violation. The operator saw an error,
   * the vehicle was still there, and its entire gallery was permanently gone.
   *
   * Deleting inside a transaction means a restricted delete rolls the image
   * rows back with it. Only once the row is committed away are the hosted
   * files genuinely unreferenced, so destroying them cannot lose a photo that
   * something still points at. The reverse failure — a file left behind after
   * the row is gone — is a stranded asset, which costs storage and can be
   * swept, rather than a broken gallery.
   */
  const orphanedPublicIds = await prisma.$transaction(async (tx) => {
    const images = await tx.vehicleImage.findMany({
      where: { vehicleId: id },
      select: { publicId: true },
    });
    // The cascade removes the rows; this throws instead if a reservation
    // appeared, and the whole transaction unwinds.
    await tx.vehicle.delete({ where: { id } });
    return images.map((image) => image.publicId);
  });

  // In parallel, and tolerant: the vehicle is already gone, so a Cloudinary
  // failure here must not be reported to the operator as a failed delete.
  const results = await Promise.allSettled(
    orphanedPublicIds.map((publicId) => deleteImage(publicId))
  );
  const stranded = orphanedPublicIds.filter(
    (_, i) => results[i]!.status === "rejected"
  );
  if (stranded.length > 0) {
    reportError(
      new Error("Vehicle deleted but some Cloudinary assets were not removed"),
      { scope: "delete-vehicle", vehicleId: id, stranded }
    );
  }
}

/**
 * Public listing. Same filters as the admin read, but a narrow payload and
 * no access to retired or off-road vehicles.
 */
export async function getPublicVehicles(
  filters: VehicleFilterInput
): Promise<Paginated<PublicVehicle>> {
  const { page, perPage } = filters;
  const where = buildPublicVehicleWhere(filters);

  const [items, total] = await prisma.$transaction([
    prisma.vehicle.findMany({
      where,
      ...publicVehicleArgs,
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

/** Public detail read: the same minimal DTO and status policy as the listing. */
export async function getPublicVehicleBySlug(
  slug: string
): Promise<PublicVehicle> {
  const vehicle = await prisma.vehicle.findFirst({
    where: {
      slug,
      status: { in: [...PUBLIC_BOOKABLE_VEHICLE_STATUSES] },
    },
    ...publicVehicleArgs,
  });
  if (!vehicle) throw new NotFoundError("Vehicle");
  return vehicle;
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
