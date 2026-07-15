import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Car,
  CalendarDays,
  ClipboardList,
  Users,
} from "lucide-react";

const NAV = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/vehicles", label: "Vehicles", icon: Car },
  { href: "/admin/reservations", label: "Reservations", icon: ClipboardList },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/calendar", label: "Calendar", icon: CalendarDays },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Defense in depth: the middleware already gates /admin, but layouts
  // render independently — never rely on a single boundary.
  const user = await requireUser();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-neutral-950 text-neutral-100">
        <div className="border-b border-neutral-800 p-5">
          <p className="text-lg font-bold tracking-tight">
            Alfa <span className="text-red-600">Rent</span>
          </p>
          <p className="text-xs text-neutral-400">Staff dashboard</p>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-neutral-800 p-4">
          <p className="truncate text-sm">{user.name}</p>
          <p className="mb-3 text-xs text-neutral-400">{user.role}</p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="w-full border-neutral-700 bg-transparent text-neutral-200 hover:bg-neutral-800 hover:text-white"
            >
              Sign out
            </Button>
          </form>
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto bg-neutral-50 p-8">
        {children}
      </main>
    </div>
  );
}
