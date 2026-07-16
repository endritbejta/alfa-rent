"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Car,
  CalendarDays,
  ClipboardList,
  Users,
  ChartNoAxesColumn,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/vehicles", label: "Vehicles", icon: Car },
  { href: "/admin/reservations", label: "Reservations", icon: ClipboardList },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/admin/analytics", label: "Analytics", icon: ChartNoAxesColumn },
];

export function AdminNav({ pendingCount = 0 }: { pendingCount?: number }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-1 p-3">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                : "text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-white/5"
            )}
          >
            {active && (
              <span className="bg-sidebar-primary absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-full" />
            )}
            <Icon className="h-4 w-4" />
            <span className="flex-1">{label}</span>
            {href === "/admin/reservations" && pendingCount > 0 && (
              <span className="bg-brand rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
                {pendingCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
