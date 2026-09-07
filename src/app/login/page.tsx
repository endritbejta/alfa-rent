import type { Metadata } from "next";
import { LoginForm } from "@/components/forms/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getI18n } from "@/lib/i18n/server";
import { safeCallbackUrl } from "@/lib/auth/callback-url";
import { LanguageSelector } from "@/components/shared/language-selector";
import { BrandLogo } from "@/components/shared/brand-logo";
import { ShieldCheck } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("auth.metaTitle"), robots: { index: false } };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { t } = await getI18n();
  const { callbackUrl } = await searchParams;
  const target = safeCallbackUrl(callbackUrl);

  return (
    <main className="bg-band text-band-foreground relative flex min-h-screen items-center justify-center overflow-hidden p-5">
      <LanguageSelector className="text-band-muted absolute top-5 right-5" />
      <div className="bg-card text-card-foreground grid w-full max-w-4xl overflow-hidden rounded-3xl shadow-lg md:grid-cols-[1.05fr_.95fr]">
        <section className="bg-sidebar text-sidebar-foreground relative hidden min-h-[34rem] flex-col justify-between overflow-hidden p-10 md:flex">
          <div
            aria-hidden="true"
            className="bg-brand/15 absolute -top-32 -left-32 h-80 w-80 rounded-full blur-3xl"
          />
          <BrandLogo className="relative text-xl" preload />
          <div className="relative">
            <span className="bg-sidebar-accent text-sidebar-accent-foreground mb-6 flex h-12 w-12 items-center justify-center rounded-2xl">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <h1 className="font-display max-w-sm text-3xl leading-tight font-bold">
              {t("auth.staffOnly")}
            </h1>
            <p className="text-sidebar-foreground/65 mt-4 max-w-sm text-sm leading-relaxed">
              {t("auth.welcome")}
            </p>
          </div>
          <p className="text-sidebar-foreground/45 text-xs">
            Alfa Rent · {new Date().getFullYear()}
          </p>
        </section>

        <Card className="flex min-h-[34rem] flex-col justify-center rounded-none border-0 p-2 shadow-none">
          <CardHeader>
            <BrandLogo className="mb-8 md:hidden" preload />
            <CardTitle className="text-2xl">{t("auth.staffSignIn")}</CardTitle>
            <CardDescription>{t("auth.staffOnly")}</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm callbackUrl={target} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
