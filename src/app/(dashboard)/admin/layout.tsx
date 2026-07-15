import { requireUser } from "@/lib/auth/guards";
import { signOut } from "@/lib/auth";
import { AdminShell } from "./admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Defense in depth: the middleware already gates /admin, but layouts
  // render independently — never rely on a single boundary.
  const user = await requireUser();

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <AdminShell
      user={{ name: user.name ?? "Staff", role: user.role }}
      signOutAction={signOutAction}
    >
      {children}
    </AdminShell>
  );
}
