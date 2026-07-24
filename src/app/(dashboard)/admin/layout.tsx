import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/guards";
import { signOut } from "@/lib/auth";
import { SIDEBAR_COLLAPSED, SIDEBAR_COOKIE } from "./sidebar-state";
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
  const [pendingCount, registrationAlerts, cookieStore] = await Promise.all([
    getPendingCount(),
    getRegistrationAlerts(),
    cookies(),
  ]);

  // Read on the server so the first paint already has the right sidebar.
  const collapsed =
    cookieStore.get(SIDEBAR_COOKIE)?.value === SIDEBAR_COLLAPSED;

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <AdminShell
      user={{ name: user.name ?? "Staff", role: user.role }}
      signOutAction={signOutAction}
      pendingCount={pendingCount}
      defaultCollapsed={collapsed}
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
