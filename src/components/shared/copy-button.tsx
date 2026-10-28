"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/shared/locale-provider";

/**
 * Copies `value` to the clipboard. The icon swaps to a tick for a moment,
 * then returns to the copy glyph. Both icons share one cell and cross-fade,
 * so the button never changes size.
 */
export function CopyButton({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  };

  const label = copied ? t("common.copied") : t("common.copy");
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      title={label}
      className={cn(
        "text-muted-foreground hover:text-foreground relative inline-flex h-8 w-8 items-center justify-center transition-colors",
        className
      )}
    >
      <Copy
        aria-hidden
        className={cn(
          "absolute h-4 w-4 transition-[opacity,transform] duration-[var(--motion-hover)] motion-reduce:transition-none",
          copied ? "scale-75 opacity-0" : "scale-100 opacity-100"
        )}
      />
      <Check
        aria-hidden
        className={cn(
          "text-status-available absolute h-4 w-4 transition-[opacity,transform] duration-[var(--motion-hover)] motion-reduce:transition-none",
          copied ? "scale-100 opacity-100" : "scale-75 opacity-0"
        )}
      />
      <span role="status" className="sr-only">
        {copied ? t("common.copied") : ""}
      </span>
    </button>
  );
}
