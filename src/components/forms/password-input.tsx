"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/components/shared/locale-provider";
import { cn } from "@/lib/utils";

/**
 * A password field with a show/hide toggle, the one sign-in has. Showing it
 * is what lets someone check a long passphrase before committing to it, and
 * an admin read a temporary password back to the person it is for.
 *
 * `type` is owned here; everything else, a react-hook-form `register()`
 * spread included, goes straight to the input.
 */
export function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        // Stops a phone "correcting" a password it is showing in plain text.
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={cn("pr-11", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((shown) => !shown)}
        aria-label={visible ? t("auth.hidePassword") : t("auth.showPassword")}
        className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center transition-colors"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
