import type { Metadata } from "next";
import { CircleCheck, ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/forms/login-form";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getI18n } from "@/lib/i18n/server";
import { safeCallbackUrl } from "@/lib/auth/callback-url";
import { AuthFrame } from "@/components/shared/auth-frame";
import { BrandLogo } from "@/components/shared/brand-logo";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("auth.metaTitle"), robots: { index: false } };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; notice?: string }>;
}) {
  const { t } = await getI18n();
  const { callbackUrl, notice } = await searchParams;
  const target = safeCallbackUrl(callbackUrl);

  return (
    <AuthFrame
      icon={ShieldCheck}
      asideTitle={t("auth.staffOnly")}
      asideBody={t("auth.welcome")}
    >
      <CardHeader>
        <BrandLogo className="mb-8 md:hidden" preload />
        <CardTitle className="text-2xl">{t("auth.staffSignIn")}</CardTitle>
        <CardDescription>{t("auth.staffOnly")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Changing a password signs you out everywhere, this browser
            included, so sign-in is where you land. Without a word it looks
            like the change failed. Only a known value is read: the param
            selects a message, it is never shown. */}
        {notice === "password-changed" && (
          <p
            role="status"
            className="border-success/40 bg-success/10 flex items-start gap-2 border p-3 text-sm"
          >
            <CircleCheck className="text-success mt-0.5 h-4 w-4 shrink-0" />
            {t("auth.passwordChanged")}
          </p>
        )}
        <LoginForm callbackUrl={target} />
      </CardContent>
    </AuthFrame>
  );
}
