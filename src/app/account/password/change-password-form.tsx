"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { changeOwnPasswordAction } from "./actions";
import { PasswordInput } from "@/components/forms/password-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/components/shared/locale-provider";
import {
  PASSWORD_MIN_CHARACTERS,
  PASSWORD_PROBLEM_TEXT,
  passwordProblem,
} from "@/lib/password-policy";

type Fields = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

/**
 * Current password, new password, the new one again.
 *
 * The checks here are react-hook-form's, fed by the same policy function the
 * server enforces, so the person hears about a short password as they type
 * and in their own language. As on sign-in, zod stays out of this bundle; the
 * schema in the action is what binds.
 *
 * Success is never answered here: the action signs out and sends the browser
 * to sign-in, which says the password changed.
 */
export function ChangePasswordForm({
  email,
  forced,
}: {
  email: string;
  /** On a temporary password, the "current" one is the one the admin gave. */
  forced: boolean;
}) {
  const { t } = useI18n();
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Fields>();

  const onSubmit = (data: Fields) => {
    setServerError(null);
    startTransition(async () => {
      const result = await changeOwnPasswordAction(data);
      if (result?.error) setServerError(result.error);
    });
  };

  const describedBy = (field: keyof Fields, hint?: string) =>
    [hint, errors[field] ? `${field}-error` : undefined]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {/* Tells a password manager whose password this is, so it updates the
          saved login for this account instead of guessing. Never shown. */}
      <input
        type="text"
        name="username"
        autoComplete="username"
        value={email}
        readOnly
        hidden
      />

      <div className="space-y-2">
        <Label htmlFor="currentPassword">
          {forced ? t("staff.temporaryPassword") : t("account.currentPassword")}
        </Label>
        <PasswordInput
          id="currentPassword"
          autoComplete="current-password"
          disabled={pending}
          aria-invalid={errors.currentPassword ? true : undefined}
          aria-describedby={describedBy("currentPassword")}
          {...register("currentPassword", {
            required: t("auth.passwordRequired"),
          })}
        />
        <FieldError
          field="currentPassword"
          message={errors.currentPassword?.message}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="newPassword">{t("account.newPassword")}</Label>
        <PasswordInput
          id="newPassword"
          autoComplete="new-password"
          disabled={pending}
          aria-invalid={errors.newPassword ? true : undefined}
          aria-describedby={describedBy("newPassword", "newPassword-hint")}
          {...register("newPassword", {
            validate: (value) => {
              const problem = passwordProblem(value);
              if (!problem) return true;
              const { key, values } = PASSWORD_PROBLEM_TEXT[problem];
              return t(key, values);
            },
          })}
        />
        <p id="newPassword-hint" className="text-muted-foreground text-xs">
          {t("account.newPasswordHint", { min: PASSWORD_MIN_CHARACTERS })}
        </p>
        <FieldError field="newPassword" message={errors.newPassword?.message} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">{t("account.confirmPassword")}</Label>
        <PasswordInput
          id="confirmPassword"
          autoComplete="new-password"
          disabled={pending}
          aria-invalid={errors.confirmPassword ? true : undefined}
          aria-describedby={describedBy("confirmPassword")}
          {...register("confirmPassword", {
            validate: (value, values) =>
              value === values.newPassword || t("err.passwordMismatch"),
          })}
        />
        <FieldError
          field="confirmPassword"
          message={errors.confirmPassword?.message}
        />
      </div>

      {serverError && (
        <p role="alert" className="text-destructive text-sm">
          {serverError}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("account.submitting") : t("account.submit")}
      </Button>
    </form>
  );
}

function FieldError({
  field,
  message,
}: {
  field: keyof Fields;
  message?: string;
}) {
  if (!message) return null;
  return (
    <p id={`${field}-error`} role="alert" className="text-destructive text-sm">
      {message}
    </p>
  );
}
