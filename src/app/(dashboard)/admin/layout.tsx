import { requireUser } from "@/lib/auth/guards";
import { signOut } from "@/lib/auth";
import { getPendingCount } from "@/services/reservation.service";
import { getRegistrationAlerts } from "@/services/fleet.service";
import { PendingBanner } from "@/components/dashboard/pending-banner";
import { AdminShell } from "./admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Defense in depth: the middleware already gates /admin, but layouts
  // render independently — never rely on a single boundary.
  const user = await requireUser();
  // Operational alerts live in the layout so they follow staff everywhere.
  const [pendingCount, registrationAlerts] = await Promise.all([
    getPendingCount(),
    getRegistrationAlerts(),
  ]);

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <AdminShell
      user={{ name: user.name ?? "Staff", role: user.role }}
      signOutAction={signOutAction}
      pendingCount={pendingCount}
      banner={
        <PendingBanner
          pendingCount={pendingCount}
          registrationAlerts={registrationAlerts}
        />
      }
    >
      {children}
    </AdminShell>
  );
}
