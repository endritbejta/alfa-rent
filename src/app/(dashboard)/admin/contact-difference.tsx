"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import {
  submittedContactAsCustomerInput,
  type ContactDifference,
} from "@/lib/booking-contact";
import { updateCustomerAction } from "./customers/actions";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/shared/locale-provider";
import { toasts } from "@/components/dashboard/toaster";
import { cn } from "@/lib/utils";

/**
 * A public booking that arrived with other contact details than the customer
 * it was linked to. The record is never changed from the storefront — the
 * request is unauthenticated — so staff see both side by side and decide.
 * Copying is one click, through the same EMPLOYEE-level edit the customer
 * drawer uses, and never happens on its own.
 *
 * Only the fields that disagree are listed; a reservation whose details match
 * the file renders nothing here at all.
 */
export function ContactDifferenceNotice({
  difference,
  customerId,
  customerNotes,
  onApplied,
  className,
}: {
  difference: ContactDifference;
  customerId: string;
  /** Kept as they are: the edit replaces the whole record. */
  customerNotes: string | null;
  onApplied?: () => void;
  className?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { submitted, onFile } = difference;

  const rows = [
    difference.name && {
      key: "name",
      label: t("admin.name"),
      submitted: `${submitted.firstName} ${submitted.lastName}`,
      onFile: `${onFile.firstName} ${onFile.lastName}`,
    },
    difference.phone && {
      key: "phone",
      label: t("admin.phone"),
      submitted: submitted.phone,
      onFile: onFile.phone,
      href: `tel:${submitted.phone.replace(/[^\d+]/g, "")}`,
    },
    difference.email && {
      key: "email",
      label: t("admin.email"),
      submitted: submitted.email,
      onFile: onFile.email,
    },
  ].filter((row) => !!row);

  const apply = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateCustomerAction(
        customerId,
        submittedContactAsCustomerInput(difference, customerNotes)
      );
      if (result?.error) {
        setError(result.error);
        return;
      }
      toasts.success(t("toast.customerSaved"));
      router.refresh();
      onApplied?.();
    });
  };

  return (
    <div
      role="note"
      className={cn(
        "border-status-maint bg-status-maint/8 border-l-2 px-3 py-2.5",
        className
      )}
    >
      <p className="text-status-maint flex items-center gap-1.5 text-xs font-semibold">
        <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
        {t("admin.contactDiffers")}
      </p>
      <p className="text-muted-foreground mt-0.5 text-[11px]">
        {t("admin.contactDiffersHint")}
      </p>

      <table className="mt-2 w-full table-fixed text-xs">
        <colgroup>
          <col className="w-[22%]" />
          <col />
          <col />
        </colgroup>
        <thead>
          <tr className="text-muted-foreground text-[10px] font-semibold tracking-[0.08em] uppercase">
            <th scope="col" className="sr-only">
              {t("admin.details")}
            </th>
            <th scope="col" className="pr-2 pb-1 text-left font-semibold">
              {t("admin.contactSubmitted")}
            </th>
            <th scope="col" className="pb-1 text-left font-semibold">
              {t("admin.contactOnFile")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="align-top">
              <th
                scope="row"
                className="text-muted-foreground py-0.5 pr-2 text-left font-normal"
              >
                {row.label}
              </th>
              <td className="py-0.5 pr-2 font-semibold break-words">
                {"href" in row && row.href ? (
                  <a href={row.href} className="text-brand hover:underline">
                    {row.submitted}
                  </a>
                ) : (
                  row.submitted
                )}
              </td>
              <td className="text-muted-foreground py-0.5 break-words">
                {row.onFile}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {error && (
        <p role="alert" className="text-destructive mt-2 text-xs">
          {error}
        </p>
      )}
      <div className="mt-2.5 flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={apply}
          disabled={pending}
        >
          {pending ? t("admin.contactApplying") : t("admin.contactApply")}
        </Button>
      </div>
    </div>
  );
}
