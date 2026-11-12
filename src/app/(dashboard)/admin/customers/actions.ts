"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/lib/auth/guards";
import { errorMessage } from "@/lib/errors-i18n";
import {
  customerSchema,
  customerSearchSchema,
  mergeCustomersSchema,
} from "@/lib/validations/customer";
import { z } from "zod";
import {
  anonymiseCustomer,
  getCustomers,
  mergeCustomers,
  updateCustomer,
} from "@/services/customer.service";

export type ActionResult = { error: string } | undefined;

function revalidateCustomerViews() {
  revalidatePath("/admin/customers");
  revalidatePath("/admin/reservations");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/calendar");
}

/**
 * Correcting a phone number or a misspelt name is counter work, so EMPLOYEE
 * level — the same people who take the bookings.
 */
export async function updateCustomerAction(
  customerId: string,
  input: unknown
): Promise<ActionResult> {
  await requireRole("EMPLOYEE");
  try {
    await updateCustomer(customerId, customerSchema.parse(input));
  } catch (error) {
    return { error: await errorMessage(error) };
  }
  revalidateCustomerViews();
  return undefined;
}

/**
 * Merging deletes records and rewrites whose history is whose, so it is
 * ADMIN-only.
 */
export async function mergeCustomersAction(
  input: unknown
): Promise<{ moved: number } | { error: string }> {
  await requireRole("ADMIN");
  let result: { moved: number };
  try {
    result = await mergeCustomers(mergeCustomersSchema.parse(input));
  } catch (error) {
    return { error: await errorMessage(error) };
  }
  revalidateCustomerViews();
  return result;
}

/**
 * Erasing someone's personal data cannot be undone and answers a legal
 * request, so it is ADMIN-only, like merging. The guard sits outside the try
 * so its sign-in redirect reaches Next (see requireUser).
 */
export async function anonymiseCustomerAction(
  customerId: unknown
): Promise<{ reservations: number } | { error: string }> {
  await requireRole("ADMIN");
  let result: { reservations: number };
  try {
    result = await anonymiseCustomer(z.string().min(1).parse(customerId));
  } catch (error) {
    return { error: await errorMessage(error) };
  }
  revalidateCustomerViews();
  return result;
}

export type CustomerHit = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
};

/** The booking dialog's customer lookup — the same match as the list. */
export async function searchCustomersAction(
  query: string
): Promise<{ hits: CustomerHit[] } | { error: string }> {
  try {
    await requireUser();
    const q = customerSearchSchema.parse(query);
    if (!q || q.length < 2) return { hits: [] };
    const { items } = await getCustomers({
      page: 1,
      perPage: 8,
      q,
      includeAnonymised: false,
    });
    return {
      hits: items.map(({ id, firstName, lastName, phone, email }) => ({
        id,
        firstName,
        lastName,
        phone,
        email,
      })),
    };
  } catch (error) {
    return { error: await errorMessage(error) };
  }
}
