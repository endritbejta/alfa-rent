"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/shared/locale-provider";

export function ThemeToggle({
  showLabel = false,
  className,
}: {
  showLabel?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Theme is browser state. Defer reading it until after hydration so the
  // server and first client render keep identical button content.
  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const dark = mounted ? resolvedTheme === "dark" : true;
  const action = dark ? t("theme.toLight") : t("theme.toDark");
  const Icon = dark ? Sun : Moon;

  return (
    <button
      type="button"
      aria-label={mounted ? action : t("theme.toggle")}
      title={mounted ? action : t("theme.toggle")}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className={cn(
        "border-band-border text-band-muted hover:text-band-foreground inline-flex h-8 cursor-pointer items-center justify-center gap-2 rounded-lg border px-2 transition-colors hover:bg-white/8",
        showLabel && "justify-start px-2.5 text-xs font-semibold",
        className
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {showLabel && (
        <span>
          {mounted
            ? dark
              ? t("theme.light")
              : t("theme.dark")
            : t("theme.label")}
        </span>
      )}
    </button>
  );
}
