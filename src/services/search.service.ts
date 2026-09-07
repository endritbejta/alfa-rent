import { prisma } from "@/lib/db/prisma";
import { vehicleLabel } from "@/lib/vehicle-label";

export type SearchHit = {
  kind: "vehicle" | "reservation" | "customer";
  id: string;
  title: string;
  subtitle: string;
};

/** Per entity. Twelve hits with three headings fits a palette without scrolling. */
const PER_KIND = 4;

/**
 * One query across the three things staff actually look for by name.
 *
 * Deliberately narrow: brand/model/plate, customer name/email, and
 * reservations by the customer on them — the fields someone can actually
 * recall while holding a phone to their ear. Searching notes or descriptions
 * would return more and answer less.
 *
 * The three queries run in parallel rather than in a transaction; nothing
 * here needs a consistent snapshot, and Promise.all keeps Prisma's types
 * intact (see the groupBy note in HANDOFF.md).
 */
export async function searchAdmin(query: string): Promise<SearchHit[]> {
  const q = query.trim();
  // Two characters is where the result set stops being the whole database.
  if (q.length < 2) return [];

  const like = { contains: q, mode: "insensitive" as const };

  const [vehicles, customers, reservations] = await Promise.all([
    prisma.vehicle.findMany({
      where: {
        OR: [{ brand: like }, { model: like }, { plate: like }],
      },
      select: { id: true, brand: true, model: true, plate: true, year: true },
      orderBy: [{ brand: "asc" }, { model: "asc" }],
      take: PER_KIND,
    }),
    prisma.customer.findMany({
      where: {
        OR: [{ firstName: like }, { lastName: like }, { email: like }],
      },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: { createdAt: "desc" },
      take: PER_KIND,
    }),
    prisma.reservation.findMany({
      where: {
        OR: [
          { customer: { firstName: like } },
          { customer: { lastName: like } },
          { vehicle: { plate: like } },
        ],
      },
      select: {
        id: true,
        pickupDate: true,
        returnDate: true,
        status: true,
        customer: { select: { firstName: true, lastName: true } },
        vehicle: { select: { brand: true, model: true, plate: true } },
      },
      // Open rentals first: a search during a phone call is almost never
      // about something that finished in March.
      orderBy: [{ status: "asc" }, { pickupDate: "desc" }],
      take: PER_KIND,
    }),
  ]);

  const day = (d: Date) =>
    d.toISOString().slice(0, 10).split("-").reverse().join("/");

  return [
    ...reservations.map((r) => ({
      kind: "reservation" as const,
      id: r.id,
      title: `${r.customer.firstName} ${r.customer.lastName}`,
      subtitle: `${vehicleLabel(r.vehicle)} · ${day(r.pickupDate)}–${day(r.returnDate)} · ${r.status.toLowerCase()}`,
    })),
    ...vehicles.map((v) => ({
      kind: "vehicle" as const,
      id: v.id,
      title: vehicleLabel(v),
      subtitle: String(v.year),
    })),
    ...customers.map((c) => ({
      kind: "customer" as const,
      id: c.id,
      title: `${c.firstName} ${c.lastName}`,
      subtitle: c.email,
    })),
  ];
}
