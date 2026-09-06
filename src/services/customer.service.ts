import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/errors";
import type { Customer } from "@prisma/client";
import type { Paginated } from "@/types/api";
import type { PaginationInput } from "@/lib/validations/common";

export type CustomerInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

/**
 * Attach a public booking to a customer, creating one only if the email is
 * new.
 *
 * Deliberately does NOT update an existing record. This runs unauthenticated:
 * anyone who guesses a customer's email could otherwise rewrite the name and
 * phone number staff call to confirm a rental. A returning customer whose
 * details have genuinely changed is corrected by staff in the admin, where
 * there is an identity to trust.
 */
export async function findOrCreateCustomerByEmail(
  input: CustomerInput
): Promise<Customer> {
  const email = input.email.toLowerCase();
  const existing = await prisma.customer.findUnique({ where: { email } });
  if (existing) return existing;

  try {
    return await prisma.customer.create({ data: { ...input, email } });
  } catch (error) {
    // Two bookings for a new email can race between the read and the write;
    // the unique index settles it, and the loser just reads the winner's row.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const raced = await prisma.customer.findUnique({ where: { email } });
      if (raced) return raced;
    }
    throw error;
  }
}

export async function getCustomers({
  page,
  perPage,
}: PaginationInput): Promise<Paginated<Customer>> {
  const [items, total] = await prisma.$transaction([
    prisma.customer.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.customer.count(),
  ]);
  return {
    items,
    total,
    page,
    perPage,
    totalPages: Math.ceil(total / perPage),
  };
}

/**
 * Reservation states that count toward what a customer has actually spent.
 *
 * Narrower than analytics' REVENUE_STATUSES, which also counts CONFIRMED:
 * revenue is money committed, this is money realised. A rental that has not
 * started yet is not yet spend.
 */
const SPENT_STATUSES = ["ACTIVE", "COMPLETED"] as const;

/**
 * Lifetime spend, aggregated in SQL.
 *
 * Both drawers used to reduce over whatever reservations they happened to have
 * loaded — 20 rows in the reservation drawer, 50 in the customer drawer — so a
 * repeat customer's total was silently understated, and the two screens showed
 * different numbers for the same person one click apart. The one labelled
 * "Lifetime" was itself capped.
 */
export async function getCustomerSpend(customerId: string): Promise<number> {
  const { _sum } = await prisma.reservation.aggregate({
    _sum: { totalPrice: true },
    where: { customerId, status: { in: [...SPENT_STATUSES] } },
  });
  // Summed as Decimal in the database and converted once here, rather than
  // adding floats row by row in the browser.
  return Number(_sum.totalPrice ?? 0);
}

export async function getCustomerById(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      reservations: {
        orderBy: { pickupDate: "desc" },
        take: 50,
        include: {
          vehicle: {
            select: { brand: true, model: true, plate: true, slug: true },
          },
        },
      },
    },
  });
  if (!customer) throw new NotFoundError("Customer");
  return { ...customer, spend: await getCustomerSpend(id) };
}
