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
 * Public bookings identify customers by email: a returning customer is
 * updated with their latest contact details instead of duplicated.
 */
export async function upsertCustomerByEmail(
  input: CustomerInput
): Promise<Customer> {
  const email = input.email.toLowerCase();
  return prisma.customer.upsert({
    where: { email },
    create: { ...input, email },
    update: {
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
    },
  });
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
