"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages, LoaderCircle } from "lucide-react";
import { setLocaleAction } from "@/app/locale-actions";
import { useI18n } from "@/components/shared/locale-provider";
import { cn } from "@/lib/utils";

export function LanguageSelector({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label
      className={cn(
        "relative inline-flex h-9 items-center gap-1.5 rounded-lg border border-current/20 px-2 text-xs",
        className
      )}
    >
      {pending ? (
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Languages className="h-3.5 w-3.5" />
      )}
      <span className="sr-only">{t("language.label")}</span>
      <select
        aria-label={t("language.label")}
        value={locale}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value;
          startTransition(async () => {
            await setLocaleAction(next);
            document.documentElement.lang = next;
            router.refresh();
          });
        }}
        className="[&>option]:bg-card [&>option]:text-card-foreground cursor-pointer appearance-none bg-transparent pr-3 font-semibold outline-none disabled:cursor-wait"
      >
        <option value="sq">{compact ? "SQ" : t("language.sq")}</option>
        <option value="en">{compact ? "EN" : t("language.en")}</option>
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-2 text-[8px]"
      >
        ▼
      </span>
    </label>
  );
}
