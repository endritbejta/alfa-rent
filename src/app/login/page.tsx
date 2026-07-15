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

export const metadata: Metadata = {
  title: "Staff Login | Alfa Rent a Car",
  robots: { index: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
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
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Alfa Rent a Car</CardTitle>
          <CardDescription>Staff sign in</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm callbackUrl={target} />
        </CardContent>
      </Card>
    </main>
  );
}
