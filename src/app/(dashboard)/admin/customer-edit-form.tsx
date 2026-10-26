"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CustomerDetail } from "./detail-actions";
import { updateCustomerAction } from "./customers/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/components/shared/locale-provider";
import { toasts } from "@/components/dashboard/toaster";
import { MISSING_PHONE, WALK_IN_EMAIL } from "@/lib/validations/customer";

/**
 * Edits a customer in the drawer, where staff already are when they notice a
 * wrong number. Placeholder contact details from the old walk-in flow start
 * empty, so the field asks for the real value instead of showing "-".
 */
export function CustomerEditForm({
  detail,
  onSaved,
  onCancel,
}: {
  detail: CustomerDetail;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: detail.firstName,
    lastName: detail.lastName === "-" ? "" : detail.lastName,
    email: WALK_IN_EMAIL.test(detail.email) ? "" : detail.email,
    phone: detail.phone === MISSING_PHONE ? "" : detail.phone,
    notes: detail.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateCustomerAction(detail.id, form);
      if (result?.error) {
        setError(result.error);
        return;
      }
      toasts.success(t("toast.customerSaved"));
      // Lists behind the drawer show the name and phone too.
      router.refresh();
      onSaved();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field
          id="customer-first-name"
          label={t("booking.firstName")}
          value={form.firstName}
          onChange={set("firstName")}
          autoComplete="off"
          required
        />
        <Field
          id="customer-last-name"
          label={t("booking.lastName")}
          value={form.lastName}
          onChange={set("lastName")}
          autoComplete="off"
          required
        />
      </div>
      <Field
        id="customer-phone"
        label={t("admin.phone")}
        type="tel"
        value={form.phone}
        onChange={set("phone")}
        required
      />
      <Field
        id="customer-email"
        label={t("admin.email")}
        type="email"
        value={form.email}
        onChange={set("email")}
        required
      />
      <div className="space-y-1.5">
        <Label htmlFor="customer-notes">{t("admin.notes")}</Label>
        <Textarea
          id="customer-notes"
          value={form.notes}
          onChange={(e) => set("notes")(e.target.value)}
          rows={3}
          maxLength={1000}
        />
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={pending}
        >
          {t("common.cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? t("admin.saving") : t("admin.saveChanges")}
        </Button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  ...input
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
} & Omit<React.ComponentProps<"input">, "id" | "value" | "onChange">) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...input}
      />
    </div>
  );
}
