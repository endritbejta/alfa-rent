"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Languages, LoaderCircle } from "lucide-react";
import { setLocaleAction } from "@/lib/i18n/locale-actions";
import { useI18n } from "@/components/shared/locale-provider";
import { cn } from "@/lib/utils";

/**
 * The select is the whole box, not a word inside it. It used to sit as a
 * small inline element next to the icon, so a click on the icon, the arrow
 * or the padding did nothing — the box looked like one control and only
 * part of it was. Now the native select is stretched over the box and the
 * icon and arrow are drawn on top of it with `pointer-events-none`, so every
 * pixel opens it, and it is still the real, keyboard- and screen-reader-
 * friendly native control.
 *
 * `variant="row"` is the settings-drawer layout: a full-width row with the
 * label on the left and the current language on the right.
 */
export function LanguageSelector({
  compact = false,
  variant = "pill",
  className,
}: {
  compact?: boolean;
  variant?: "pill" | "row";
  className?: string;
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const Icon = pending ? LoaderCircle : Languages;

  const select = (
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
      className={cn(
        "[&>option]:bg-card [&>option]:text-card-foreground cursor-pointer appearance-none bg-transparent font-semibold outline-none disabled:cursor-wait",
        variant === "row"
          ? // Invisible but on top: the row's own text shows the value, and
            // the select catches every click anywhere in the row.
            "absolute inset-0 h-full w-full opacity-0"
          : "h-full grow pr-6 pl-7"
      )}
    >
      <option value="sq">{compact ? "SQ" : t("language.sq")}</option>
      <option value="en">{compact ? "EN" : t("language.en")}</option>
    </select>
  );

  if (variant === "row") {
    return (
      <label
        className={cn(
          "has-[select:focus-visible]:ring-ring/50 hover:bg-muted relative flex h-11 w-full cursor-pointer items-center gap-3 rounded-none border px-3 text-sm transition-colors has-[select:disabled]:cursor-wait has-[select:focus-visible]:ring-3",
          className
        )}
      >
        <Icon
          aria-hidden
          className={cn("h-4 w-4 shrink-0", pending && "animate-spin")}
        />
        <span className="flex-1">{t("language.label")}</span>
        <span aria-hidden className="text-muted-foreground">
          {t(locale === "sq" ? "language.sq" : "language.en")}
        </span>
        <ChevronDown
          aria-hidden
          className="text-muted-foreground h-4 w-4 shrink-0"
        />
        {select}
      </label>
    );
  }

  return (
    <label
      className={cn(
        "has-[select:focus-visible]:ring-ring/50 relative inline-flex h-9 cursor-pointer items-center rounded-none border border-current/20 text-xs has-[select:focus-visible]:ring-3",
        className
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-2 h-3.5 w-3.5",
          pending && "animate-spin"
        )}
      />
      {select}
      <span
        aria-hidden
        className="pointer-events-none absolute right-2 text-[8px]"
      >
        ▼
      </span>
    </label>
  );
}
