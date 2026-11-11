import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { signOut } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { AuthFrame } from "@/components/shared/auth-frame";
import { BrandLogo } from "@/components/shared/brand-logo";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { ChangePasswordForm } from "./change-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("admin.changePassword"), robots: { index: false } };
}

/**
 * Changing your own password, for any signed-in staff member.
 *
 * Deliberately outside the admin layout. The layout sends anyone still on a
 * temporary password here, so a page inside it would redirect to itself, and
 * the form has to work before its owner has been let into the admin at all.
 * It wears the sign-in page's frame for the same reason: for someone on a
 * temporary password, this is the second half of signing in.
 */
export default async function ChangePasswordPage() {
  const user = await requireUser();
  const { t } = await getI18n();
  const forced = user.mustChangePassword;

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <AuthFrame
      icon={KeyRound}
      asideTitle={t("account.asideTitle")}
      asideBody={t("account.asideBody")}
      asideTitleAs="p"
    >
      <CardHeader>
        <BrandLogo className="mb-8 md:hidden" preload />
        <h1 className="font-heading text-2xl leading-snug font-medium">
          {forced ? t("account.chooseTitle") : t("account.changeTitle")}
        </h1>
        <CardDescription>
          {forced ? t("account.chooseLede") : t("account.changeLede")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ChangePasswordForm email={user.email} forced={forced} />
        {/* Someone on a temporary password has nowhere to go back to: the
            admin would only send them here again. Signing out is their way
            out instead. */}
        {forced ? (
          <form action={signOutAction}>
            <Button
              type="submit"
              variant="link"
              size="sm"
              className="text-muted-foreground"
            >
              {t("admin.signOut")}
            </Button>
          </form>
        ) : (
          <Button
            variant="link"
            size="sm"
            nativeButton={false}
            className="text-muted-foreground"
            render={<Link href="/admin/dashboard" />}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("admin.backDashboard")}
          </Button>
        )}
      </CardContent>
    </AuthFrame>
  );
}
