"use server";

import { revalidatePath } from "next/cache";
import { signOut } from "@/lib/auth";
import { requireRole } from "@/lib/auth/guards";
import { errorMessage } from "@/lib/errors-i18n";
import {
  changeStaffRoleSchema,
  createStaffSchema,
  resetStaffPasswordSchema,
  staffTargetSchema,
} from "@/lib/validations/staff";
import {
  changeStaffRole,
  createStaff,
  deactivateStaff,
  reactivateStaff,
  resetStaffPassword,
  signOutStaffEverywhere,
} from "@/services/staff.service";

/*
 * Staff accounts are ADMIN-only, all of them. Each export below is a public
 * endpoint that can be POSTed to directly, so each one checks the role and
 * parses its input itself rather than trusting the page that renders it.
 *
 * The guard runs inside the try, so an employee who reaches one of these
 * gets "You do not have permission" back as a message instead of a crash
 * screen. Every catch goes through errorMessage().
 */

export type StaffActionResult = { error: string } | undefined;

function revalidateStaff() {
  revalidatePath("/admin/staff");
}

export async function createStaffAction(
  input: unknown
): Promise<StaffActionResult> {
  try {
    await requireRole("ADMIN");
    await createStaff(createStaffSchema.parse(input));
  } catch (error) {
    return { error: await errorMessage(error) };
  }
  revalidateStaff();
  return undefined;
}

export async function changeStaffRoleAction(
  input: unknown
): Promise<StaffActionResult> {
  try {
    const admin = await requireRole("ADMIN");
    const { userId, role } = changeStaffRoleSchema.parse(input);
    await changeStaffRole(admin.id, userId, role);
  } catch (error) {
    return { error: await errorMessage(error) };
  }
  revalidateStaff();
  return undefined;
}

export async function deactivateStaffAction(
  input: unknown
): Promise<StaffActionResult> {
  try {
    const admin = await requireRole("ADMIN");
    const { userId } = staffTargetSchema.parse(input);
    await deactivateStaff(admin.id, userId);
  } catch (error) {
    return { error: await errorMessage(error) };
  }
  revalidateStaff();
  return undefined;
}

export async function reactivateStaffAction(
  input: unknown
): Promise<StaffActionResult> {
  try {
    await requireRole("ADMIN");
    const { userId } = staffTargetSchema.parse(input);
    await reactivateStaff(userId);
  } catch (error) {
    return { error: await errorMessage(error) };
  }
  revalidateStaff();
  return undefined;
}

export async function resetStaffPasswordAction(
  input: unknown
): Promise<StaffActionResult> {
  try {
    const admin = await requireRole("ADMIN");
    const { userId, temporaryPassword } = resetStaffPasswordSchema.parse(input);
    await resetStaffPassword(admin.id, userId, temporaryPassword);
  } catch (error) {
    return { error: await errorMessage(error) };
  }
  revalidateStaff();
  return undefined;
}

export async function signOutStaffEverywhereAction(
  input: unknown
): Promise<StaffActionResult> {
  let signedOutSelf = false;
  try {
    const admin = await requireRole("ADMIN");
    const { userId } = staffTargetSchema.parse(input);
    await signOutStaffEverywhere(userId);
    signedOutSelf = userId === admin.id;
  } catch (error) {
    return { error: await errorMessage(error) };
  }
  // "Everywhere" includes this browser, whose session no longer passes the
  // guard. Clearing its cookie now, outside the try so the redirect is not
  // caught, beats letting the next click discover it.
  if (signedOutSelf) await signOut({ redirectTo: "/login" });
  revalidateStaff();
  return undefined;
}
