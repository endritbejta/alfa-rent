"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tooltip } from "@base-ui/react/tooltip";
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

export function AdminNav({
  pendingCount = 0,
  collapsed = false,
}: {
  pendingCount?: number;
  collapsed?: boolean;
}) {
  const pathname = usePathname();

  return (
    <Tooltip.Provider delay={400}>
      <nav className={cn("flex-1 space-y-1 p-3", collapsed && "px-2")}>
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          const badge = href === "/admin/reservations" && pendingCount > 0;

          const link = (
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              aria-label={collapsed ? label : undefined}
              className={cn(
                "relative flex items-center rounded-lg text-sm transition-colors",
                collapsed ? "h-10 w-10 justify-center" : "gap-3 px-3 py-2",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                  : "text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-white/5"
              )}
            >
              {active && !collapsed && (
                <span className="bg-sidebar-primary absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-full" />
              )}
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="flex-1">{label}</span>}
              {badge && !collapsed && (
                <span className="bg-brand rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
                  {pendingCount}
                </span>
              )}
              {/* Collapsed: the count has nowhere to sit, so it becomes a dot.
                  The number is gone but the fact that someone is waiting is not. */}
              {badge && collapsed && (
                <span className="bg-brand ring-sidebar absolute top-1 right-1 h-2 w-2 rounded-full ring-2" />
              )}
            </Link>
          );

          if (!collapsed) return <div key={href}>{link}</div>;

          return (
            <Tooltip.Root key={href}>
              <Tooltip.Trigger render={link} />
              <Tooltip.Portal>
                <Tooltip.Positioner side="right" sideOffset={10}>
                  <Tooltip.Popup className="bg-popover text-popover-foreground rounded-md border px-2.5 py-1.5 text-xs font-medium shadow-md">
                    {label}
                    {badge && (
                      <span className="text-brand ml-1.5 font-bold tabular-nums">
                        {pendingCount}
                      </span>
                    )}
                  </Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>
          );
        })}
      </nav>
    </Tooltip.Provider>
  );
}
