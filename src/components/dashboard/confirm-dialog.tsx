"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/components/shared/locale-provider";

/** Shared, focus-managed confirmation for irreversible actions. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = "danger",
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "neutral";
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !pending) onCancel();
      }}
    >
      <DialogContent
        role="alertdialog"
        showCloseButton={false}
        className="max-w-sm rounded-2xl p-6"
      >
        <div className="flex gap-4">
          <span
            className={
              tone === "danger"
                ? "bg-destructive/10 text-destructive flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                : "bg-status-maint/10 text-status-maint flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            }
          >
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="font-display text-base font-bold">
              {title}
            </DialogTitle>
            <DialogDescription className="mt-1 leading-relaxed">
              {body}
            </DialogDescription>
          </div>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={pending}
          >
            {cancelLabel ?? t("common.cancel")}
          </Button>
          <Button
            variant={tone === "danger" ? "destructive-solid" : "default"}
            size="sm"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending
              ? t("admin.working")
              : (confirmLabel ?? t("admin.confirm"))}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
