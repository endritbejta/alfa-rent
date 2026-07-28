import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginForm } from "@/components/forms/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getI18n } from "@/lib/i18n/server";
import { LanguageSelector } from "@/components/shared/language-selector";

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
  const session = await auth();
  const { callbackUrl } = await searchParams;
  // Only allow relative redirect targets — an absolute URL here would be
  // an open-redirect vector.
  const target =
    callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//")
      ? callbackUrl
      : "/admin/dashboard";

  if (session?.user) redirect(target);

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-neutral-950 p-4">
      <LanguageSelector className="absolute top-4 right-4 text-neutral-200" />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Alfa Rent a Car</CardTitle>
          <CardDescription>{t("auth.staffSignIn")}</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm callbackUrl={target} />
        </CardContent>
      </Card>
    </main>
  );
}
