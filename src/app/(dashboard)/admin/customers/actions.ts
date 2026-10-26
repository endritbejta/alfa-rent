"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { errorMessage } from "@/lib/errors-i18n";
import {
  customerSchema,
  mergeCustomersSchema,
} from "@/lib/validations/customer";
import { mergeCustomers, updateCustomer } from "@/services/customer.service";

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
