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
  return customer;
}
