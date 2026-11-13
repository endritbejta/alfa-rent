"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/shared/locale-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { DurationChoice } from "@/lib/rental-dates";

const OPTIONS: { choice: DurationChoice; label: TranslationKey }[] = [
  { choice: "day", label: "booking.durationDay" },
  { choice: "week", label: "booking.durationWeek" },
  { choice: "custom", label: "booking.durationCustom" },
];

/**
 * One day, one week, or the customer's own dates.
 *
 * Native radios under a segmented look, so arrow keys move the choice and a
 * screen reader announces a group of three — no hand-rolled roving focus.
 * The parent owns what a choice does to the dates; this only reports it.
 */
export function RentalDurationPresets({
  value,
  onChange,
  className,
}: {
  value: DurationChoice;
  onChange: (choice: DurationChoice) => void;
  className?: string;
}) {
  const { t } = useI18n();
  const name = useId();

  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="sr-only">{t("booking.duration")}</legend>
      <div className="border-input divide-input bg-control grid grid-cols-3 divide-x rounded-none border">
        {OPTIONS.map(({ choice, label }) => (
          <label
            key={choice}
            className={cn(
              "text-muted-foreground hover:bg-surface-hover hover:text-foreground relative flex min-h-11 cursor-pointer items-center justify-center px-2 py-2.5 text-center text-sm font-medium transition-colors",
              "has-[:checked]:bg-surface-hover has-[:checked]:text-foreground has-[:checked]:shadow-[inset_0_-2px_0_var(--brand)]",
              "has-[:focus-visible]:z-10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--brand)]"
            )}
          >
            <input
              type="radio"
              name={name}
              value={choice}
              checked={value === choice}
              onChange={() => onChange(choice)}
              className="sr-only"
            />
            {t(label)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
