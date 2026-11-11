"use client";

import { useState, useTransition } from "react";
import type { Role } from "@prisma/client";
import { UserPlus } from "lucide-react";
import { createStaffAction } from "./actions";
import { TemporaryPasswordField } from "./temporary-password-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toasts } from "@/components/dashboard/toaster";
import { useI18n } from "@/components/shared/locale-provider";
import {
  generateTemporaryPassword,
  PASSWORD_PROBLEM_TEXT,
  passwordProblem,
} from "@/lib/password-policy";
import { ROLE_KEYS } from "@/lib/status-labels";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";

/* The same hint-level check sign-in uses; the schema on the server binds. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLES = [
  { role: "EMPLOYEE", hint: "staff.roleEmployeeHint" },
  { role: "ADMIN", hint: "staff.roleAdminHint" },
] as const satisfies { role: Role; hint: TranslationKey }[];

type Form = {
  name: string;
  email: string;
  role: Role;
  temporaryPassword: string;
};
type FieldErrors = Partial<Record<keyof Form, string>>;

const EMPTY: Form = {
  name: "",
  email: "",
  role: "EMPLOYEE",
  temporaryPassword: "",
};

/**
 * Adds a staff account with a temporary password. Employee is the default
 * role: admin is the one that can lock everyone else out, so it is chosen on
 * purpose rather than left selected.
 */
export function AddStaffDialog() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const onOpenChange = (next: boolean) => {
    if (pending) return;
    if (next) {
      // Generated on open, in the event, so the server render never makes
      // one and every opening starts from a fresh password.
      setForm({ ...EMPTY, temporaryPassword: generateTemporaryPassword() });
      setErrors({});
      setServerError(null);
    }
    setOpen(next);
  };

  const validate = (): FieldErrors => {
    const found: FieldErrors = {};
    if (!form.name.trim()) found.name = t("staff.nameRequired");
    if (!EMAIL.test(form.email.trim())) found.email = t("auth.emailInvalid");
    const problem = passwordProblem(form.temporaryPassword);
    if (problem) {
      const { key, values } = PASSWORD_PROBLEM_TEXT[problem];
      found.temporaryPassword = t(key, values);
    }
    return found;
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setServerError(null);
    startTransition(async () => {
      const result = await createStaffAction(form);
      if (result?.error) {
        setServerError(result.error);
        return;
      }
      toasts.success(
        t("toast.staffAdded", { name: form.name.trim() }),
        t("toast.staffAddedWhy")
      );
      setOpen(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button size="sm" />}>
        <UserPlus className="h-4 w-4" />
        {t("staff.add")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{t("staff.add")}</DialogTitle>
            <DialogDescription>{t("staff.addBody")}</DialogDescription>
          </DialogHeader>

          <Field
            id="staff-name"
            label={t("admin.name")}
            error={errors.name}
            value={form.name}
            onChange={(value) => set("name", value)}
            disabled={pending}
            autoComplete="off"
            maxLength={80}
          />
          {/* Someone else's address, so no autofill of the admin's own. */}
          <Field
            id="staff-email"
            label={t("admin.email")}
            error={errors.email}
            type="email"
            value={form.email}
            onChange={(value) => set("email", value)}
            disabled={pending}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={254}
          />

          <fieldset className="space-y-2" disabled={pending}>
            <legend className="mb-1.5 text-sm font-medium">
              {t("staff.role")}
            </legend>
            {ROLES.map(({ role, hint }) => (
              <label
                key={role}
                htmlFor={`staff-role-${role}`}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-none border p-3 text-sm",
                  form.role === role && "border-brand bg-brand/5"
                )}
              >
                <input
                  id={`staff-role-${role}`}
                  type="radio"
                  name="role"
                  value={role}
                  checked={form.role === role}
                  onChange={() => set("role", role)}
                  className="accent-brand mt-1"
                />
                <span className="min-w-0 font-medium">
                  {t(ROLE_KEYS[role])}
                  <span className="text-muted-foreground block text-xs font-normal">
                    {t(hint)}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <TemporaryPasswordField
            id="staff-temporary-password"
            value={form.temporaryPassword}
            onChange={(value) => set("temporaryPassword", value)}
            error={errors.temporaryPassword}
            disabled={pending}
          />

          {serverError && (
            <p role="alert" className="text-destructive text-sm">
              {serverError}
            </p>
          )}

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? t("admin.saving") : t("staff.add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  error,
  value,
  onChange,
  ...input
}: {
  id: string;
  label: string;
  error?: string;
  value: string;
  onChange: (value: string) => void;
} & Omit<React.ComponentProps<"input">, "id" | "value" | "onChange">) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...input}
      />
      {error && (
        <p id={errorId} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
