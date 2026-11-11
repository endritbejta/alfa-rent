"use client";

import { RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyButton } from "@/components/shared/copy-button";
import { useI18n } from "@/components/shared/locale-provider";
import {
  generateTemporaryPassword,
  PASSWORD_MIN_CHARACTERS,
} from "@/lib/password-policy";

/**
 * The password an admin hands over when adding someone or resetting them.
 *
 * Shown in plain text, in a monospace face, because it is meant to be read
 * out and copied, and it stops working the moment its owner signs in. It
 * arrives filled with a generated one so nobody is tempted to type
 * "alfarent123", and it can be regenerated or overwritten.
 *
 * Plain text also keeps password managers from offering to save it as the
 * admin's own password for this site.
 */
export function TemporaryPasswordField({
  id,
  value,
  onChange,
  error,
  disabled,
  onEnter,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  /** Lets Enter submit when the field sits outside a <form>. */
  onEnter?: () => void;
}) {
  const { t } = useI18n();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{t("staff.temporaryPassword")}</Label>
      <div className="flex items-center gap-1">
        <Input
          id={id}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && onEnter) {
              event.preventDefault();
              onEnter();
            }
          }}
          disabled={disabled}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          className="font-mono tracking-wide"
        />
        <CopyButton value={value} className="h-11 w-11 shrink-0" />
        <button
          type="button"
          onClick={() => onChange(generateTemporaryPassword())}
          disabled={disabled}
          aria-label={t("staff.generate")}
          title={t("staff.generate")}
          className="text-muted-foreground hover:text-foreground hit-area relative inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center transition-colors disabled:pointer-events-none disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>
      <p id={hintId} className="text-muted-foreground text-xs">
        {t("staff.temporaryPasswordHint", { min: PASSWORD_MIN_CHARACTERS })}
      </p>
      {error && (
        <p id={errorId} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
