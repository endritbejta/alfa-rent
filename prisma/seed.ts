import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const day = 24 * 60 * 60 * 1000;
const at10 = (daysFromNow: number) => {
  const d = new Date(Date.now() + daysFromNow * day);
  d.setHours(10, 0, 0, 0);
  return d;
};

const vehicles: Prisma.VehicleCreateInput[] = [
  {
    slug: "vw-golf-8-2023",
    brand: "Volkswagen",
    model: "Golf 8",
    year: 2023,
    category: "COMPACT",
    transmission: "MANUAL",
    fuelType: "DIESEL",
    seats: 5,
    pricePerDay: new Prisma.Decimal(35),
    description:
      "The benchmark compact hatchback. Efficient 2.0 TDI engine, comfortable for city driving and long trips alike.",
    status: "AVAILABLE",
  },
  {
    slug: "vw-passat-2022",
    brand: "Volkswagen",
    model: "Passat",
    year: 2022,
    category: "SEDAN",
    transmission: "AUTOMATIC",
    fuelType: "DIESEL",
    seats: 5,
    pricePerDay: new Prisma.Decimal(45),
    description:
      "Spacious business sedan with DSG automatic, adaptive cruise control, and a large boot for luggage.",
    status: "AVAILABLE",
  },
  {
    slug: "skoda-octavia-2023",
    brand: "Skoda",
    model: "Octavia",
    year: 2023,
    category: "SEDAN",
    transmission: "MANUAL",
    fuelType: "PETROL",
    seats: 5,
    pricePerDay: new Prisma.Decimal(38),
    description:
      "Practical and reliable family sedan with exceptional boot space and low fuel consumption.",
    status: "AVAILABLE",
  },
  {
    slug: "audi-a4-2023",
    brand: "Audi",
    model: "A4",
    year: 2023,
    category: "SEDAN",
    transmission: "AUTOMATIC",
    fuelType: "DIESEL",
    seats: 5,
    pricePerDay: new Prisma.Decimal(60),
    description:
      "Premium sedan with quattro all-wheel drive, virtual cockpit, and refined highway manners.",
    status: "AVAILABLE",
  },
  {
    slug: "mercedes-e-class-2024",
    brand: "Mercedes-Benz",
    model: "E-Class",
    year: 2024,
    category: "LUXURY",
    transmission: "AUTOMATIC",
    fuelType: "DIESEL",
    seats: 5,
    pricePerDay: new Prisma.Decimal(95),
    description:
      "Flagship executive comfort: massage seats, ambient lighting, and the latest MBUX system. Ideal for business travel and weddings.",
    status: "AVAILABLE",
  },
  {
    slug: "bmw-x5-2023",
    brand: "BMW",
    model: "X5",
    year: 2023,
    category: "LUXURY",
    transmission: "AUTOMATIC",
    fuelType: "DIESEL",
    seats: 5,
    pricePerDay: new Prisma.Decimal(110),
    description:
      "Commanding luxury SUV with xDrive, panoramic roof, and effortless power for any terrain.",
    status: "RENTED",
  },
  {
    slug: "toyota-rav4-hybrid-2023",
    brand: "Toyota",
    model: "RAV4 Hybrid",
    year: 2023,
    category: "SUV",
    transmission: "AUTOMATIC",
    fuelType: "HYBRID",
    seats: 5,
    pricePerDay: new Prisma.Decimal(55),
    description:
      "Self-charging hybrid SUV with all-wheel drive and outstanding fuel economy in city traffic.",
    status: "AVAILABLE",
  },
  {
    slug: "renault-clio-2022",
    brand: "Renault",
    model: "Clio",
    year: 2022,
    category: "ECONOMY",
    transmission: "MANUAL",
    fuelType: "PETROL",
    seats: 5,
    pricePerDay: new Prisma.Decimal(25),
    description:
      "Our most affordable option. Nimble, easy to park, and cheap to run — perfect for city stays.",
    status: "AVAILABLE",
  },
  {
    slug: "vw-tiguan-2023",
    brand: "Volkswagen",
    model: "Tiguan",
    year: 2023,
    category: "SUV",
    transmission: "AUTOMATIC",
    fuelType: "DIESEL",
    seats: 5,
    pricePerDay: new Prisma.Decimal(50),
    description:
      "Versatile family SUV with 4Motion all-wheel drive, generous rear legroom, and a full safety suite.",
    status: "SERVICE",
  },
  {
    slug: "mercedes-v-class-2022",
    brand: "Mercedes-Benz",
    model: "V-Class",
    year: 2022,
    category: "VAN",
    transmission: "AUTOMATIC",
    fuelType: "DIESEL",
    seats: 8,
    pricePerDay: new Prisma.Decimal(120),
    description:
      "Eight-seat luxury van for group travel and airport transfers. Twin sliding doors and conference seating.",
    status: "AVAILABLE",
  },
];

async function main() {
  console.log("Seeding database...");

  // Idempotent: wipe in FK-safe order so re-running the seed is safe in dev.
  await prisma.reservation.deleteMany();
  await prisma.vehicleImage.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();

  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  await prisma.user.create({
    data: {
      name: "Admin",
      email: "admin@alfarent.com",
      password: await bcrypt.hash(adminPassword, 12),
      role: "ADMIN",
    },
  });
  await prisma.user.create({
    data: {
      name: "Employee",
      email: "employee@alfarent.com",
      password: await bcrypt.hash(adminPassword, 12),
      role: "EMPLOYEE",
    },
  });

  const created: Awaited<ReturnType<typeof prisma.vehicle.create>>[] = [];
  for (const v of vehicles) {
    created.push(await prisma.vehicle.create({ data: v }));
  }
  const bySlug = (slug: string) => {
    const v = created.find((c) => c.slug === slug);
    if (!v) throw new Error(`Seed vehicle not found: ${slug}`);
    return v;
  };

  const [arta, blerim, donika] = await Promise.all([
    prisma.customer.create({
      data: {
        firstName: "Arta",
        lastName: "Krasniqi",
        email: "arta.krasniqi@example.com",
        phone: "+383 44 123 456",
      },
    }),
    prisma.customer.create({
      data: {
        firstName: "Blerim",
        lastName: "Gashi",
        email: "blerim.gashi@example.com",
        phone: "+383 45 987 654",
        notes: "Repeat customer, prefers automatic transmission.",
      },
    }),
    prisma.customer.create({
      data: {
        firstName: "Donika",
        lastName: "Berisha",
        email: "donika.berisha@example.com",
        phone: "+383 49 555 111",
      },
    }),
  ]);

  const rentalDays = (from: Date, to: Date) =>
    Math.round((to.getTime() - from.getTime()) / day);
  const reserve = (
    slug: string,
    customerId: string,
    from: Date,
    to: Date,
    status: "PENDING" | "CONFIRMED" | "ACTIVE" | "COMPLETED" | "CANCELLED",
    notes?: string
  ) => {
    const vehicle = bySlug(slug);
    return prisma.reservation.create({
      data: {
        vehicleId: vehicle.id,
        customerId,
        pickupDate: from,
        returnDate: to,
        status,
        totalPrice: vehicle.pricePerDay.mul(rentalDays(from, to)),
        notes,
      },
    });
  };

  // Non-overlapping per vehicle for CONFIRMED/ACTIVE — the DB exclusion
  // constraint rejects double-bookings.
  await reserve("bmw-x5-2023", arta.id, at10(-2), at10(3), "ACTIVE");
  await reserve(
    "mercedes-e-class-2024",
    blerim.id,
    at10(5),
    at10(9),
    "CONFIRMED"
  );
  await reserve(
    "vw-golf-8-2023",
    donika.id,
    at10(2),
    at10(6),
    "PENDING",
    "Asked about airport pickup."
  );
  await reserve("audi-a4-2023", blerim.id, at10(-20), at10(-15), "COMPLETED");
  await reserve("renault-clio-2022", arta.id, at10(-10), at10(-8), "COMPLETED");
  await reserve(
    "toyota-rav4-hybrid-2023",
    donika.id,
    at10(1),
    at10(4),
    "CANCELLED",
    "Cancelled by customer, trip postponed."
  );

  const counts = {
    users: await prisma.user.count(),
    vehicles: await prisma.vehicle.count(),
    customers: await prisma.customer.count(),
    reservations: await prisma.reservation.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
