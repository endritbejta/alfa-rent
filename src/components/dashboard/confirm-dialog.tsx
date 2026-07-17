"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { Button } from "@/components/ui/button";

/**
 * One confirmation for every irreversible action. The trap lands focus on
 * the first focusable — Cancel, by DOM order — and Escape cancels, so the
 * destructive path always takes a deliberate act.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
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
  const panelRef = useRef<HTMLDivElement>(null);

  // The trap owns focus placement and restore; Cancel is first in DOM order,
  // so the safe choice gets focus without naming it.
  useFocusTrap(panelRef, open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
        className="absolute inset-0 animate-[overlay-in_150ms_ease-out] cursor-default bg-black/50"
      />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        tabIndex={-1}
        className="glass-l6 relative z-10 w-full max-w-sm rounded-2xl p-6 shadow-lg outline-none motion-safe:animate-[modal-in_var(--motion-modal)_var(--ease-standard)]"
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
            <h2 id="confirm-title" className="font-display text-base font-bold">
              {title}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              {body}
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={pending}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "destructive-solid" : "default"}
            size="sm"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "Working..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
