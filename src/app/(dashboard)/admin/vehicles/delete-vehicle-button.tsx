"use client";

import { useState, useTransition } from "react";
import { deleteVehicleAction } from "./actions";
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
import { useI18n } from "@/components/shared/locale-provider";
import { toasts } from "@/components/dashboard/toaster";

export function DeleteVehicleButton({ vehicleId }: { vehicleId: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      const result = await deleteVehicleAction(vehicleId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      // "Removed" would be a new untruth for a vehicle with history: that one
      // is still on the list, as inactive.
      if (result.removal === "retired") {
        toasts.success(t("toast.vehicleRetired"), t("toast.vehicleRetiredWhy"));
      } else {
        toasts.success(t("toast.vehicleDeleted"));
      }
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="destructive" size="sm" />}>
        {t("admin.delete")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("admin.deleteVehicleShort")}</DialogTitle>
          <DialogDescription>
            {t("admin.deleteVehicleExplanation")}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {pending ? t("admin.deleting") : t("admin.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
