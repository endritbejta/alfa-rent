import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ConflictError, NotFoundError } from "@/lib/errors";
import type { Customer } from "@prisma/client";
import type { Paginated } from "@/types/api";
import type { PaginationInput } from "@/lib/validations/common";
import {
  MISSING_PHONE,
  WALK_IN_EMAIL,
  looksLikePhone,
  normalizePhone,
  type CustomerFormInput,
  type MergeCustomersInput,
} from "@/lib/validations/customer";

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

/**
 * The SQL twin of normalizePhone: digits only, then without the international
 * prefix, the 383 country code and the trunk zero.
 */
const NORMALIZED_PHONE_SQL = Prisma.sql`regexp_replace(regexp_replace(phone, '\\D', '', 'g'), '^(00)?(383)?0*', '')`;

/**
 * Customers whose phone contains this number, however either was typed.
 *
 * Stored numbers carry spaces and a country code ("+383 49 947 292"), while
 * staff on a call type what they hear ("049 947 292"). Both sides are reduced
 * to the national number before comparing. Only a query that looks like a
 * phone is tried, so a name with a digit in it does not match every number
 * containing that digit. Prisma cannot express regexp_replace, hence the raw
 * query; the value is bound, never interpolated.
 */
export async function customerIdsByPhone(query: string): Promise<string[]> {
  if (!looksLikePhone(query)) return [];
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM customers
    WHERE ${NORMALIZED_PHONE_SQL} LIKE '%' || ${normalizePhone(query)} || '%'
    LIMIT 200
  `;
  return rows.map((row) => row.id);
}

/**
 * Every word must match a name, the email or the phone, so "ilir rex" finds
 * Ilir Rexhepi without matching every Ilir and every Rexhepi.
 */
async function customerSearchWhere(
  query: string | undefined
): Promise<Prisma.CustomerWhereInput> {
  const q = query?.trim();
  if (!q) return {};
  const phoneIds = await customerIdsByPhone(q);
  const like = (term: string) => ({
    contains: term,
    mode: "insensitive" as const,
  });
  return {
    OR: [
      {
        AND: q.split(/\s+/).map((term) => ({
          OR: [
            { firstName: like(term) },
            { lastName: like(term) },
            { email: like(term) },
            { phone: like(term) },
          ],
        })),
      },
      ...(phoneIds.length > 0 ? [{ id: { in: phoneIds } }] : []),
    ],
  };
}

export async function getCustomers({
  page,
  perPage,
  q,
}: PaginationInput & { q?: string }): Promise<Paginated<Customer>> {
  const where = await customerSearchWhere(q);
  const [items, total] = await prisma.$transaction([
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.customer.count({ where }),
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

/**
 * Staff correct a customer's details here — the counterpart the public
 * booking path deliberately lacks (see findOrCreateCustomerByEmail).
 *
 * Email is the only unique column, so a unique-index conflict can only mean
 * the address belongs to someone else; saying so beats the generic
 * "a record with this value already exists". That other record is very
 * likely the same person, which is what merging is for.
 */
export async function updateCustomer(
  id: string,
  input: CustomerFormInput
): Promise<Customer> {
  try {
    return await prisma.customer.update({ where: { id }, data: input });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictError("Another customer already uses this email", {
        key: "err.customerEmailTaken",
      });
    }
    throw error;
  }
}

export type DuplicateGroup = {
  reason: "phone" | "name";
  customers: (Customer & { reservationCount: number })[];
};

/**
 * Records that are probably the same person: the same phone number once
 * formatting is ignored, or the same full name. Placeholder phones ("-")
 * never count as a match. A pair that matches on both is listed once.
 */
export async function findDuplicateCustomers(): Promise<DuplicateGroup[]> {
  const groups = await prisma.$queryRaw<
    { reason: "phone" | "name"; ids: string[] }[]
  >`
    SELECT reason, array_agg(id ORDER BY "createdAt") AS ids
    FROM (
      SELECT id, "createdAt", 'phone' AS reason,
             ${NORMALIZED_PHONE_SQL} AS key
      FROM customers
      WHERE length(${NORMALIZED_PHONE_SQL}) >= 6
      UNION ALL
      SELECT id, "createdAt", 'name' AS reason,
             lower(trim("firstName") || ' ' || trim("lastName")) AS key
      FROM customers
    ) candidates
    GROUP BY reason, key
    HAVING count(*) > 1
    ORDER BY reason DESC, min("createdAt")
    LIMIT 50
  `;

  const seen = new Set<string>();
  const unique = groups.filter((group) => {
    const signature = [...group.ids].sort().join(",");
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
  if (unique.length === 0) return [];

  const customers = await prisma.customer.findMany({
    where: { id: { in: unique.flatMap((group) => group.ids) } },
    include: { _count: { select: { reservations: true } } },
  });
  const byId = new Map(customers.map((c) => [c.id, c]));

  return unique.map((group) => ({
    reason: group.reason,
    customers: group.ids.flatMap((id) => {
      const found = byId.get(id);
      if (!found) return [];
      const { _count, ...customer } = found;
      return [{ ...customer, reservationCount: _count.reservations }];
    }),
  }));
}

/**
 * Folds duplicate records into one. Every reservation moves to the record
 * kept, the others are deleted, and all of it happens in one transaction: a
 * reservation landing on a merged record mid-way trips the foreign key and
 * the whole merge unwinds rather than half-applying.
 *
 * The kept record's details win, except where it only holds a placeholder —
 * a walk-in email or a "-" phone — and a merged record has the real thing.
 * Notes from every record are kept.
 */
export async function mergeCustomers({
  keepId,
  mergeIds,
}: MergeCustomersInput): Promise<{ moved: number }> {
  return prisma.$transaction(async (tx) => {
    const records = await tx.customer.findMany({
      where: { id: { in: [keepId, ...mergeIds] } },
    });
    const keep = records.find((c) => c.id === keepId);
    const merged = records.filter((c) => c.id !== keepId);
    if (!keep || merged.length !== mergeIds.length) {
      throw new NotFoundError("Customer");
    }

    const { count: moved } = await tx.reservation.updateMany({
      where: { customerId: { in: mergeIds } },
      data: { customerId: keepId },
    });

    const realEmail = merged.find((c) => !WALK_IN_EMAIL.test(c.email))?.email;
    const realPhone = merged.find((c) => c.phone !== MISSING_PHONE)?.phone;
    const notes = [
      ...new Set(
        [keep, ...merged]
          .map((c) => c.notes?.trim())
          .filter((note): note is string => !!note)
      ),
    ].join("\n");

    // Deleted before the update so a merged record's email can move onto the
    // kept one without tripping the unique index.
    await tx.customer.deleteMany({ where: { id: { in: mergeIds } } });
    await tx.customer.update({
      where: { id: keepId },
      data: {
        ...(WALK_IN_EMAIL.test(keep.email) &&
          realEmail && { email: realEmail }),
        ...(keep.phone === MISSING_PHONE && realPhone && { phone: realPhone }),
        notes: notes || null,
      },
    });
    return { moved };
  });
}
