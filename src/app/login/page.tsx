import type { Metadata } from "next";
import { CircleCheck } from "lucide-react";
import { LoginForm } from "@/components/forms/login-form";
import { getI18n } from "@/lib/i18n/server";
import { safeCallbackUrl } from "@/lib/auth/callback-url";
import { AuthFrame } from "@/components/shared/auth-frame";

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
      eyebrow={t("auth.eyebrow")}
      headline={t("auth.headline")}
      headlineAccent={t("auth.headlineAccent")}
      subline={t("auth.subline")}
      title={t("auth.staffSignIn")}
      description={t("auth.useCredentials")}
    >
      <div className="space-y-4">
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
      </div>
    </AuthFrame>
  );
}
