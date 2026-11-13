"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { signIn } from "next-auth/react";
import type { LoginInput } from "@/lib/validations/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/components/shared/locale-provider";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";

/*
 * These two rules are react-hook-form's own, not the zod schema the server
 * checks. Pulling zodResolver in here put the whole of zod — a 64 KiB gzip
 * chunk of its own, since nothing else on this route uses it — on the first
 * page every staff member loads, to answer "is this an email" and "is this
 * blank". loginSchema still runs in lib/auth, where the answer is binding;
 * this is only the hint that saves a round trip. The type still comes from
 * the schema, so the two cannot drift.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [authError, setAuthError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>();

  const onSubmit = async (data: LoginInput) => {
    setAuthError(null);
    const result = await signIn("credentials", { ...data, redirect: false });
    if (result?.error) {
      setAuthError(t("auth.invalid"));
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        {/* The label is for screen readers; sighted users get the icon and
            the placeholder, which say the same thing. */}
        <Label htmlFor="email" className="sr-only">
          {t("auth.email")}
        </Label>
        {/* `username`, not `email`: this field is the account's identifier,
            and that is the token password managers pair with
            current-password to offer the saved login. Phones also stop
            capitalising and "correcting" the address. */}
        <div className="relative">
          <Mail
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2"
          />
          <Input
            id="email"
            type="email"
            placeholder={t("auth.email")}
            className="pl-11"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "email-error" : undefined}
            {...register("email", {
              required: t("auth.emailRequired"),
              pattern: { value: EMAIL, message: t("auth.emailInvalid") },
            })}
          />
        </div>
        {errors.email && (
          <p id="email-error" role="alert" className="text-destructive text-sm">
            {errors.email.message}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password" className="sr-only">
          {t("auth.password")}
        </Label>
        <div className="relative">
          <LockKeyhole
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2"
          />
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder={t("auth.password")}
            className="pr-11 pl-11"
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? "password-error" : undefined}
            {...register("password", {
              required: t("auth.passwordRequired"),
            })}
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={
              showPassword ? t("auth.hidePassword") : t("auth.showPassword")
            }
            className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-11 items-center justify-center transition-colors"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        {errors.password && (
          <p
            id="password-error"
            role="alert"
            className="text-destructive text-sm"
          >
            {errors.password.message}
          </p>
        )}
      </div>
      {authError && (
        <p role="alert" className="text-destructive text-sm">
          {authError}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          t("auth.signingIn")
        ) : (
          <>
            {t("auth.signIn")}
            <ArrowRight aria-hidden="true" />
          </>
        )}
      </Button>
    </form>
  );
}
