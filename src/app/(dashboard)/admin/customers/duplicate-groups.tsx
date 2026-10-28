"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { mergeCustomersAction } from "./actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDetailDrawer } from "@/components/dashboard/detail-drawer-context";
import { useI18n } from "@/components/shared/locale-provider";
import { toasts } from "@/components/dashboard/toaster";
import { cn } from "@/lib/utils";

type Person = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  reservationCount: number;
};

export type DuplicateGroupView = {
  reason: "phone" | "name";
  customers: Person[];
};

/**
 * The record most worth keeping: the one with the history, and of equals the
 * oldest — groups arrive oldest first, so a stable sort keeps that order.
 */
function defaultKeep(customers: Person[]): string {
  return [...customers].sort(
    (a, b) => b.reservationCount - a.reservationCount
  )[0]!.id;
}

export function DuplicateGroups({ groups }: { groups: DuplicateGroupView[] }) {
  const { t } = useI18n();
  const { openCustomer } = useDetailDrawer();
  const [merging, setMerging] = useState<DuplicateGroupView | null>(null);

  return (
    <>
      <ul className="divide-y">
        {groups.map((group) => (
          <li
            key={group.customers.map((c) => c.id).join(",")}
            className="flex flex-wrap items-center gap-3 py-3"
          >
            <span className="bg-status-maint/10 text-status-maint rounded-none px-2 py-0.5 text-[11px] font-semibold">
              {group.reason === "phone"
                ? t("admin.samePhone")
                : t("admin.sameName")}
            </span>
            <div className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-1">
              {group.customers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openCustomer(c.id)}
                  className="hover:text-brand min-w-0 text-left text-sm"
                >
                  <span className="font-medium">
                    {c.firstName} {c.lastName}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {c.phone} ·{" "}
                    {t("admin.reservationCount", {
                      count: c.reservationCount,
                    })}
                  </span>
                </button>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setMerging(group)}
            >
              <Users className="h-3.5 w-3.5" />
              {t("admin.merge")}
            </Button>
          </li>
        ))}
      </ul>
      {merging && (
        <MergeDialog group={merging} onClose={() => setMerging(null)} />
      )}
    </>
  );
}

function MergeDialog({
  group,
  onClose,
}: {
  group: DuplicateGroupView;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [keepId, setKeepId] = useState(() => defaultKeep(group.customers));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const merge = () => {
    setError(null);
    startTransition(async () => {
      const result = await mergeCustomersAction({
        keepId,
        mergeIds: group.customers
          .filter((c) => c.id !== keepId)
          .map((c) => c.id),
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toasts.success(
        t("toast.customersMerged"),
        t("toast.customersMergedWhy", { count: result.moved })
      );
      router.refresh();
      onClose();
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("admin.mergeTitle")}</DialogTitle>
          <DialogDescription>{t("admin.mergeBody")}</DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-2">
          <legend className="text-muted-foreground mb-1 text-xs font-semibold">
            {t("admin.mergeKeep")}
          </legend>
          {group.customers.map((c) => (
            <label
              key={c.id}
              htmlFor={`keep-${c.id}`}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-none border p-3 text-sm",
                keepId === c.id && "border-brand bg-brand/5"
              )}
            >
              <input
                id={`keep-${c.id}`}
                type="radio"
                name="keep"
                value={c.id}
                checked={keepId === c.id}
                onChange={() => setKeepId(c.id)}
                className="accent-brand mt-1"
              />
              <span className="min-w-0 font-medium">
                {c.firstName} {c.lastName}
                <span className="text-muted-foreground block truncate text-xs font-normal">
                  {c.email}
                </span>
                <span className="text-muted-foreground block text-xs font-normal">
                  {c.phone} ·{" "}
                  {t("admin.reservationCount", { count: c.reservationCount })}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive-solid"
            onClick={merge}
            disabled={pending}
          >
            {pending ? t("admin.working") : t("admin.merge")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
