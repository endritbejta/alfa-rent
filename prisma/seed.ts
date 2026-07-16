import {
  PrismaClient,
  Prisma,
  type VehicleCategory,
  type Transmission,
  type FuelType,
  type ReservationStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;

/** Deterministic RNG (mulberry32) so re-seeding produces the same data. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260715);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const int = (min: number, max: number) =>
  Math.floor(rand() * (max - min + 1)) + min;

const at10 = (base: Date, offsetDays: number) => {
  const d = new Date(base.getTime() + offsetDays * DAY);
  d.setHours(10, 0, 0, 0);
  return d;
};

type ModelSpec = {
  brand: string;
  model: string;
  category: VehicleCategory;
  transmission: Transmission;
  fuelType: FuelType;
  seats: number;
  price: number;
  blurb: string;
};

// Curated fleet catalogue — 44 distinct models across all categories.
const CATALOGUE: ModelSpec[] = [
  {
    brand: "Renault",
    model: "Clio",
    category: "ECONOMY",
    transmission: "MANUAL",
    fuelType: "PETROL",
    seats: 5,
    price: 25,
    blurb: "Nimble, easy to park, and cheap to run — perfect for city stays.",
  },
  {
    brand: "Volkswagen",
    model: "Polo",
    category: "ECONOMY",
    transmission: "MANUAL",
    fuelType: "PETROL",
    seats: 5,
    price: 27,
    blurb: "Compact German build quality with a surprisingly roomy cabin.",
  },
  {
    brand: "Toyota",
    model: "Yaris",
    category: "ECONOMY",
    transmission: "AUTOMATIC",
    fuelType: "HYBRID",
    seats: 5,
    price: 30,
    blurb: "Self-charging hybrid supermini with outstanding city fuel economy.",
  },
  {
    brand: "Hyundai",
    model: "i20",
    category: "ECONOMY",
    transmission: "MANUAL",
    fuelType: "PETROL",
    seats: 5,
    price: 26,
    blurb: "Well-equipped and comfortable for its class, with a long warranty.",
  },
  {
    brand: "Kia",
    model: "Rio",
    category: "ECONOMY",
    transmission: "MANUAL",
    fuelType: "PETROL",
    seats: 5,
    price: 26,
    blurb: "Practical and dependable, ideal for short trips around town.",
  },
  {
    brand: "Dacia",
    model: "Sandero",
    category: "ECONOMY",
    transmission: "MANUAL",
    fuelType: "PETROL",
    seats: 5,
    price: 22,
    blurb: "The value champion — simple, spacious, and easy on the wallet.",
  },
  {
    brand: "Opel",
    model: "Corsa",
    category: "ECONOMY",
    transmission: "MANUAL",
    fuelType: "DIESEL",
    seats: 5,
    price: 28,
    blurb: "Efficient diesel supermini that eats motorway miles for breakfast.",
  },
  {
    brand: "Peugeot",
    model: "208",
    category: "ECONOMY",
    transmission: "AUTOMATIC",
    fuelType: "PETROL",
    seats: 5,
    price: 29,
    blurb: "Stylish French hatchback with the distinctive i-Cockpit interior.",
  },

  {
    brand: "Volkswagen",
    model: "Golf 8",
    category: "COMPACT",
    transmission: "MANUAL",
    fuelType: "DIESEL",
    seats: 5,
    price: 35,
    blurb:
      "The benchmark compact hatchback — refined, efficient, endlessly capable.",
  },
  {
    brand: "Ford",
    model: "Focus",
    category: "COMPACT",
    transmission: "MANUAL",
    fuelType: "PETROL",
    seats: 5,
    price: 33,
    blurb:
      "Sharp handling and a comfortable ride make this a driver's favourite.",
  },
  {
    brand: "Audi",
    model: "A3",
    category: "COMPACT",
    transmission: "AUTOMATIC",
    fuelType: "DIESEL",
    seats: 5,
    price: 48,
    blurb: "Premium compact with a classy cabin and smooth S tronic gearbox.",
  },
  {
    brand: "Mercedes-Benz",
    model: "A-Class",
    category: "COMPACT",
    transmission: "AUTOMATIC",
    fuelType: "PETROL",
    seats: 5,
    price: 50,
    blurb: "Upmarket hatchback with the latest MBUX infotainment system.",
  },
  {
    brand: "BMW",
    model: "1 Series",
    category: "COMPACT",
    transmission: "AUTOMATIC",
    fuelType: "DIESEL",
    seats: 5,
    price: 49,
    blurb: "Compact hatch with genuine premium feel and eager performance.",
  },
  {
    brand: "Seat",
    model: "Leon",
    category: "COMPACT",
    transmission: "MANUAL",
    fuelType: "PETROL",
    seats: 5,
    price: 34,
    blurb: "Golf underpinnings with a sportier edge and keen pricing.",
  },

  {
    brand: "Volkswagen",
    model: "Passat",
    category: "SEDAN",
    transmission: "AUTOMATIC",
    fuelType: "DIESEL",
    seats: 5,
    price: 45,
    blurb: "Spacious business sedan with adaptive cruise and a large boot.",
  },
  {
    brand: "Skoda",
    model: "Octavia",
    category: "SEDAN",
    transmission: "MANUAL",
    fuelType: "PETROL",
    seats: 5,
    price: 38,
    blurb:
      "Exceptional boot space and low running costs — the practical choice.",
  },
  {
    brand: "Audi",
    model: "A4",
    category: "SEDAN",
    transmission: "AUTOMATIC",
    fuelType: "DIESEL",
    seats: 5,
    price: 60,
    blurb: "Premium sedan with quattro grip, virtual cockpit, refined manners.",
  },
  {
    brand: "BMW",
    model: "3 Series",
    category: "SEDAN",
    transmission: "AUTOMATIC",
    fuelType: "DIESEL",
    seats: 5,
    price: 62,
    blurb:
      "The definitive sports sedan — precise, quick, and beautifully built.",
  },
  {
    brand: "Mercedes-Benz",
    model: "C-Class",
    category: "SEDAN",
    transmission: "AUTOMATIC",
    fuelType: "DIESEL",
    seats: 5,
    price: 63,
    blurb: "Baby S-Class comfort with a serene ride and elegant cabin.",
  },
  {
    brand: "Skoda",
    model: "Superb",
    category: "SEDAN",
    transmission: "AUTOMATIC",
    fuelType: "DIESEL",
    seats: 5,
    price: 46,
    blurb: "Limousine-grade rear legroom in a sensibly priced package.",
  },
  {
    brand: "Toyota",
    model: "Camry",
    category: "SEDAN",
    transmission: "AUTOMATIC",
    fuelType: "HYBRID",
    seats: 5,
    price: 52,
    blurb: "Whisper-quiet hybrid sedan built to cover huge distances reliably.",
  },
  {
    brand: "Mazda",
    model: "6",
    category: "SEDAN",
    transmission: "MANUAL",
    fuelType: "PETROL",
    seats: 5,
    price: 44,
    blurb: "Handsome and rewarding to drive with an upscale interior.",
  },

  {
    brand: "Toyota",
    model: "RAV4 Hybrid",
    category: "SUV",
    transmission: "AUTOMATIC",
    fuelType: "HYBRID",
    seats: 5,
    price: 55,
    blurb: "Self-charging hybrid SUV with all-wheel drive and great economy.",
  },
  {
    brand: "Volkswagen",
    model: "Tiguan",
    category: "SUV",
    transmission: "AUTOMATIC",
    fuelType: "DIESEL",
    seats: 5,
    price: 50,
    blurb: "Versatile family SUV with 4Motion grip and a full safety suite.",
  },
  {
    brand: "Nissan",
    model: "Qashqai",
    category: "SUV",
    transmission: "MANUAL",
    fuelType: "PETROL",
    seats: 5,
    price: 42,
    blurb:
      "The original crossover — practical, comfortable, easy to live with.",
  },
  {
    brand: "Hyundai",
    model: "Tucson",
    category: "SUV",
    transmission: "AUTOMATIC",
    fuelType: "DIESEL",
    seats: 5,
    price: 46,
    blurb: "Bold styling, generous kit, and a smooth automatic gearbox.",
  },
  {
    brand: "Kia",
    model: "Sportage",
    category: "SUV",
    transmission: "AUTOMATIC",
    fuelType: "DIESEL",
    seats: 5,
    price: 45,
    blurb: "Well-rounded family SUV with a long warranty and roomy cabin.",
  },
  {
    brand: "Ford",
    model: "Kuga",
    category: "SUV",
    transmission: "AUTOMATIC",
    fuelType: "HYBRID",
    seats: 5,
    price: 48,
    blurb: "Plug-in-ready SUV that blends efficiency with a comfortable ride.",
  },
  {
    brand: "Mazda",
    model: "CX-5",
    category: "SUV",
    transmission: "AUTOMATIC",
    fuelType: "DIESEL",
    seats: 5,
    price: 49,
    blurb: "Premium-feeling SUV that's genuinely enjoyable on a winding road.",
  },
  {
    brand: "Peugeot",
    model: "3008",
    category: "SUV",
    transmission: "AUTOMATIC",
    fuelType: "DIESEL",
    seats: 5,
    price: 47,
    blurb: "Striking design and a futuristic cockpit set this crossover apart.",
  },

  {
    brand: "Mercedes-Benz",
    model: "E-Class",
    category: "LUXURY",
    transmission: "AUTOMATIC",
    fuelType: "DIESEL",
    seats: 5,
    price: 95,
    blurb: "Flagship executive comfort — massage seats, ambient light, MBUX.",
  },
  {
    brand: "BMW",
    model: "5 Series",
    category: "LUXURY",
    transmission: "AUTOMATIC",
    fuelType: "DIESEL",
    seats: 5,
    price: 92,
    blurb: "The thinking driver's executive saloon — composed and quick.",
  },
  {
    brand: "Audi",
    model: "A6",
    category: "LUXURY",
    transmission: "AUTOMATIC",
    fuelType: "DIESEL",
    seats: 5,
    price: 90,
    blurb: "Understated luxury with quattro drive and a tech-laden cabin.",
  },
  {
    brand: "Mercedes-Benz",
    model: "S-Class",
    category: "LUXURY",
    transmission: "AUTOMATIC",
    fuelType: "PETROL",
    seats: 5,
    price: 150,
    blurb: "The ultimate statement of automotive luxury and technology.",
  },
  {
    brand: "BMW",
    model: "X5",
    category: "LUXURY",
    transmission: "AUTOMATIC",
    fuelType: "DIESEL",
    seats: 5,
    price: 110,
    blurb: "Commanding luxury SUV with xDrive and effortless power.",
  },
  {
    brand: "Audi",
    model: "Q7",
    category: "LUXURY",
    transmission: "AUTOMATIC",
    fuelType: "DIESEL",
    seats: 7,
    price: 120,
    blurb: "Seven-seat luxury SUV with limousine refinement and space.",
  },
  {
    brand: "Porsche",
    model: "Cayenne",
    category: "LUXURY",
    transmission: "AUTOMATIC",
    fuelType: "PETROL",
    seats: 5,
    price: 180,
    blurb: "Sports-car dynamics wrapped in a practical luxury SUV body.",
  },
  {
    brand: "Land Rover",
    model: "Range Rover Sport",
    category: "LUXURY",
    transmission: "AUTOMATIC",
    fuelType: "DIESEL",
    seats: 5,
    price: 165,
    blurb: "Peerless off-road ability paired with first-class on-road comfort.",
  },

  {
    brand: "Mercedes-Benz",
    model: "V-Class",
    category: "VAN",
    transmission: "AUTOMATIC",
    fuelType: "DIESEL",
    seats: 8,
    price: 120,
    blurb: "Eight-seat luxury van for group travel and airport transfers.",
  },
  {
    brand: "Volkswagen",
    model: "Multivan",
    category: "VAN",
    transmission: "AUTOMATIC",
    fuelType: "DIESEL",
    seats: 7,
    price: 105,
    blurb: "Flexible seven-seater with configurable seating for any trip.",
  },
  {
    brand: "Ford",
    model: "Transit Custom",
    category: "VAN",
    transmission: "MANUAL",
    fuelType: "DIESEL",
    seats: 9,
    price: 95,
    blurb: "Nine-seat workhorse for large groups and heavy luggage.",
  },
  {
    brand: "Renault",
    model: "Trafic",
    category: "VAN",
    transmission: "MANUAL",
    fuelType: "DIESEL",
    seats: 9,
    price: 90,
    blurb: "Dependable people-mover with plenty of room for the whole team.",
  },
  {
    brand: "Opel",
    model: "Vivaro",
    category: "VAN",
    transmission: "MANUAL",
    fuelType: "DIESEL",
    seats: 8,
    price: 88,
    blurb: "Comfortable eight-seat van, easy to drive despite its size.",
  },
];

const FIRST_NAMES = [
  "Arta",
  "Blerim",
  "Donika",
  "Endrit",
  "Fatjona",
  "Gezim",
  "Hana",
  "Ilir",
  "Jeta",
  "Kushtrim",
  "Liridona",
  "Mentor",
  "Nora",
  "Oltion",
  "Petrit",
  "Qendresa",
  "Rinor",
  "Shpresa",
  "Trim",
  "Uran",
  "Vlora",
  "Ylber",
  "Zana",
  "Agon",
  "Besa",
  "Dritan",
  "Elira",
  "Flamur",
  "Gentiana",
  "Hekuran",
];
const LAST_NAMES = [
  "Krasniqi",
  "Gashi",
  "Berisha",
  "Hoxha",
  "Shala",
  "Kelmendi",
  "Bytyqi",
  "Morina",
  "Rexhepi",
  "Zeqiri",
  "Dervishi",
  "Ahmeti",
  "Bajrami",
  "Kastrati",
  "Luzha",
  "Nimani",
  "Osmani",
  "Prekazi",
  "Sylejmani",
  "Thaqi",
];

function slugify(brand: string, model: string, year: number, suffix?: number) {
  const base = `${brand}-${model}-${year}${suffix ? `-${suffix}` : ""}`;
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function main() {
  console.log("Seeding database (rich dataset)...");

  await prisma.reservation.deleteMany();
  await prisma.vehicleImage.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();

  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const hash = await bcrypt.hash(adminPassword, 12);
  await prisma.user.createMany({
    data: [
      {
        name: "Admin",
        email: "admin@alfarent.com",
        password: hash,
        role: "ADMIN",
      },
      {
        name: "Employee",
        email: "employee@alfarent.com",
        password: hash,
        role: "EMPLOYEE",
      },
    ],
  });

  // --- 50 vehicles: whole catalogue plus 6 duplicate models in a new year ---
  const specs: (ModelSpec & { year: number })[] = CATALOGUE.map((s) => ({
    ...s,
    year: int(2021, 2025),
  }));
  const populars = CATALOGUE.filter((s) =>
    [
      "Golf 8",
      "Passat",
      "RAV4 Hybrid",
      "E-Class",
      "Octavia",
      "Tiguan",
    ].includes(s.model)
  );
  for (const s of populars) {
    specs.push({ ...s, year: int(2021, 2025) });
  }

  const usedSlugs = new Set<string>();
  const usedPlates = new Set<string>();
  const now = new Date();

  // Kosovo-style registration plates, e.g. 01-234-AB.
  const LETTERS = "ABCDEFGHIJKLMNOPRSTUVXYZ";
  const nextPlate = () => {
    let plate = "";
    do {
      plate = `0${int(1, 5)}-${int(100, 999)}-${pick([...LETTERS])}${pick([...LETTERS])}`;
    } while (usedPlates.has(plate));
    usedPlates.add(plate);
    return plate;
  };

  const vehicles = [];
  for (const spec of specs) {
    let slug = slugify(spec.brand, spec.model, spec.year);
    let n = 2;
    while (usedSlugs.has(slug))
      slug = slugify(spec.brand, spec.model, spec.year, n++);
    usedSlugs.add(slug);
    // Price jitter so identical models aren't priced identically.
    const price = spec.price + int(-3, 5);
    vehicles.push(
      await prisma.vehicle.create({
        data: {
          slug,
          plate: nextPlate(),
          brand: spec.brand,
          model: spec.model,
          year: spec.year,
          category: spec.category,
          transmission: spec.transmission,
          fuelType: spec.fuelType,
          seats: spec.seats,
          pricePerDay: new Prisma.Decimal(price),
          description: spec.blurb,
          status: "AVAILABLE",
          createdAt: at10(now, -int(30, 400)),
        },
      })
    );
  }

  // --- customers ---
  const customers = [];
  const usedEmails = new Set<string>();
  const customerCount = 34;
  for (let i = 0; i < customerCount; i++) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    let email = `${first}.${last}@example.com`.toLowerCase();
    let n = 2;
    while (usedEmails.has(email))
      email = `${first}.${last}${n++}@example.com`.toLowerCase();
    usedEmails.add(email);
    customers.push(
      await prisma.customer.create({
        data: {
          firstName: first,
          lastName: last,
          email,
          phone: `+383 4${int(3, 9)} ${int(100, 999)} ${int(100, 999)}`,
          notes: rand() < 0.2 ? "Repeat customer, prefers automatic." : null,
          createdAt: at10(now, -int(5, 200)),
        },
      })
    );
  }

  // --- reservations: ~2.5 months history + upcoming, non-overlapping per car ---
  const HISTORY_START = -75;
  const HISTORY_END = 25;

  for (const vehicle of vehicles) {
    const price = vehicle.pricePerDay;
    let cursor = HISTORY_START + int(0, 8);

    while (cursor < HISTORY_END) {
      // Occupancy varies by category — luxury/vans sit idle more.
      const gap = int(1, 7);
      const duration = int(2, 8);
      const pickupOffset = cursor + gap;
      const returnOffset = pickupOffset + duration;
      if (returnOffset > HISTORY_END) break;

      const pickupDate = at10(now, pickupOffset);
      const returnDate = at10(now, returnOffset);
      const customer = pick(customers);
      const days = returnOffset - pickupOffset;

      let status: ReservationStatus;
      if (returnOffset < 0) {
        status = rand() < 0.12 ? "CANCELLED" : "COMPLETED";
      } else if (pickupOffset <= 0 && returnOffset >= 0) {
        status = "ACTIVE";
      } else {
        const r = rand();
        status = r < 0.25 ? "PENDING" : r < 0.9 ? "CONFIRMED" : "CANCELLED";
      }

      // Booking created a few days before pickup (clamped to not exceed now).
      const createdOffset = Math.min(pickupOffset - int(1, 12), -0);
      await prisma.reservation.create({
        data: {
          vehicleId: vehicle.id,
          customerId: customer.id,
          pickupDate,
          returnDate,
          status,
          totalPrice: price.mul(days),
          notes: rand() < 0.15 ? "Airport pickup requested." : null,
          createdAt: at10(now, Math.min(createdOffset, 0)),
        },
      });

      // Skip ahead past this rental plus a buffer; leave ~35% of cars idle now.
      cursor = returnOffset + int(1, 9);
      if (rand() < 0.3) break; // some vehicles get few rentals
    }
  }

  // --- vehicle status reflects reality: active rental => RENTED ---
  const activeNow = await prisma.reservation.findMany({
    where: { status: "ACTIVE" },
    select: { vehicleId: true },
  });
  const rentedIds = new Set(activeNow.map((r) => r.vehicleId));
  for (const vehicle of vehicles) {
    let status: (typeof vehicle)["status"] = "AVAILABLE";
    if (rentedIds.has(vehicle.id)) status = "RENTED";
    else {
      const r = rand();
      if (r < 0.08) status = "SERVICE";
      else if (r < 0.12) status = "INACTIVE";
    }
    if (status !== "AVAILABLE") {
      await prisma.vehicle.update({
        where: { id: vehicle.id },
        data: { status },
      });
    }
  }

  const counts = {
    users: await prisma.user.count(),
    vehicles: await prisma.vehicle.count(),
    customers: await prisma.customer.count(),
    reservations: await prisma.reservation.count(),
    active: await prisma.reservation.count({ where: { status: "ACTIVE" } }),
    completed: await prisma.reservation.count({
      where: { status: "COMPLETED" },
    }),
    pending: await prisma.reservation.count({ where: { status: "PENDING" } }),
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
