"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The CSV export menu. A native <details> stayed open until its own button
 * was pressed again, so it hung over the page after a click elsewhere. This
 * one closes on a click or tap outside it, on Escape (returning focus to its
 * button), and once a file has been chosen.
 *
 * The listeners exist only while the menu is open: an effect that syncs with
 * the document, not derived state.
 */
export function ExportMenu({
  label,
  items,
}: {
  label: string;
  items: { href: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative print:hidden">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "border-input hover:bg-surface-hover focus-visible:ring-ring inline-flex h-9 items-center gap-1.5 border px-3 text-xs font-semibold outline-none focus-visible:ring-2",
          open && "bg-surface-hover"
        )}
      >
        <Download className="size-3.5" aria-hidden />
        {label}
        <ChevronDown
          aria-hidden
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
        />
      </button>
      <ul
        id={menuId}
        hidden={!open}
        className="bg-popover absolute right-0 z-20 mt-1 w-64 border py-1 text-sm shadow-md"
      >
        {items.map((item) => (
          <li key={item.href}>
            <a
              href={item.href}
              download
              onClick={() => setOpen(false)}
              className="hover:bg-surface-hover focus-visible:bg-surface-hover block px-3 py-2 outline-none"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
