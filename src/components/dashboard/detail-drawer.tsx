"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Right-side drawer used by every summary widget: clicking an item opens
 * detail here instead of navigating away, so staff keep their place. Full
 * height on desktop, a bottom sheet on mobile.
 */
export function DetailDrawer({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-[1px]"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "bg-card absolute right-0 bottom-0 flex max-h-[92vh] w-full flex-col rounded-t-2xl border shadow-2xl",
          "sm:top-0 sm:bottom-0 sm:max-h-none sm:w-[26rem] sm:rounded-none sm:rounded-l-2xl",
          "animate-in slide-in-from-bottom sm:slide-in-from-right duration-200"
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b p-5">
          <div className="min-w-0">
            <h2 className="font-display truncate text-lg font-bold">{title}</h2>
            {subtitle && (
              <p className="text-muted-foreground truncate text-xs">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
    </div>
  );
}
