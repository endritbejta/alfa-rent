import { z } from "zod";
import { Role } from "@prisma/client";
import {
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_CHARACTERS,
  passwordProblem,
} from "@/lib/password-policy";

/*
 * Inputs to the staff actions. Every export of a "use server" file is a public
 * endpoint that anyone can POST to, so nothing an action receives is trusted
 * until it has been through one of these.
 *
 * The messages are English, like the other schemas: the forms check the same
 * rules first and say so in the operator's language, so these only speak to a
 * request that skipped the form.
 */

const PROBLEM_MESSAGES = {
  tooShort: `Use at least ${PASSWORD_MIN_CHARACTERS} characters`,
  tooLong: `Use at most ${PASSWORD_MAX_BYTES} bytes; longer passwords are cut short by bcrypt`,
} as const;

/** A password the policy accepts. Never trimmed: a space is a character. */
export const passwordSchema = z.string().superRefine((password, ctx) => {
  const problem = passwordProblem(password);
  if (problem)
    ctx.addIssue({ code: "custom", message: PROBLEM_MESSAGES[problem] });
});

/** A user id from a row the page rendered. cuid today, so short. */
const userId = z.string().trim().min(1).max(64);

export const staffTargetSchema = z.object({ userId });

export const createStaffSchema = z.object({
  name: z.string().trim().min(1).max(80),
  // Lower-cased because sign-in lower-cases what it is given before it looks
  // the account up. An address stored with a capital letter could never sign
  // in at all.
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  role: z.enum(Role),
  temporaryPassword: passwordSchema,
});

export const changeStaffRoleSchema = z.object({
  userId,
  role: z.enum(Role),
});

export const resetStaffPasswordSchema = z.object({
  userId,
  temporaryPassword: passwordSchema,
});

export const changeOwnPasswordSchema = z
  .object({
    // Not held to the policy: it is whatever the account has today, which
    // may predate the policy. Bounded only so a request cannot be huge.
    currentPassword: z.string().min(1).max(1024),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "The two new passwords do not match",
    path: ["confirmPassword"],
  });

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type ChangeOwnPasswordInput = z.infer<typeof changeOwnPasswordSchema>;
