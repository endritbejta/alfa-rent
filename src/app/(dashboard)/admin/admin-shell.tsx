"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { AdminNav } from "./admin-nav";
import { CommandPalette } from "./command-palette";
import { ReservationDetailProvider } from "./reservation-detail";
import {
  SIDEBAR_COLLAPSED,
  SIDEBAR_COOKIE,
  SIDEBAR_MAX_AGE,
} from "./sidebar-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ShellUser = { name: string; role: string };

function SidebarChrome({
  user,
  signOutAction,
  pendingCount,
  collapsed = false,
}: {
  user: ShellUser;
  signOutAction: () => Promise<void>;
  pendingCount: number;
  collapsed?: boolean;
}) {
  return (
    <>
      <div
        className={cn(
          "border-sidebar-border border-b",
          collapsed ? "flex h-[73px] items-center justify-center px-2" : "p-5"
        )}
      >
        {collapsed ? (
          // The wordmark's own initial, not a new logo. Collapsing the
          // sidebar shouldn't rebrand the product.
          <p className="font-display text-lg font-bold">
            A<span className="text-sidebar-primary">R</span>
          </p>
        ) : (
          <>
            <p className="font-display text-lg font-bold tracking-tight">
              ALFA <span className="text-sidebar-primary">RENT</span>
            </p>
            <p className="text-sidebar-foreground/50 text-xs">
              Staff dashboard
            </p>
          </>
        )}
      </div>

      <AdminNav pendingCount={pendingCount} collapsed={collapsed} />

      <div
        className={cn(
          "border-sidebar-border border-t",
          collapsed ? "p-2" : "p-4"
        )}
      >
        {!collapsed && (
          <>
            <p className="truncate text-sm">{user.name}</p>
            <p className="text-sidebar-foreground/50 mb-3 text-xs">
              {user.role}
            </p>
          </>
        )}
        <form action={signOutAction}>
          <Button
            type="submit"
            variant="outline"
            size="sm"
            aria-label={collapsed ? "Sign out" : undefined}
            title={collapsed ? `Sign out — ${user.name}` : undefined}
            className={cn(
              "w-full border-neutral-700 bg-transparent text-neutral-200 hover:bg-white/8 hover:text-white",
              collapsed && "px-0"
            )}
          >
            {collapsed ? <LogOut className="h-3.5 w-3.5" /> : "Sign out"}
          </Button>
        </form>
      </div>
    </>
  );
}

export function AdminShell({
  user,
  signOutAction,
  pendingCount,
  defaultCollapsed = false,
  banner,
  children,
}: {
  user: ShellUser;
  signOutAction: () => Promise<void>;
  pendingCount: number;
  /** Read from the cookie on the server, so the first paint is correct. */
  defaultCollapsed?: boolean;
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const pathname = usePathname();

  // Close the drawer on navigation.
  useEffect(() => {
    const timer = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(timer);
  }, [pathname]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      // Written here rather than through a server action: collapsing a
      // sidebar should not cost a round trip. The server reads it on the
      // next navigation.
      document.cookie = `${SIDEBAR_COOKIE}=${
        next ? SIDEBAR_COLLAPSED : "expanded"
      }; path=/; max-age=${SIDEBAR_MAX_AGE}; samesite=lax`;
      return next;
    });
  }, []);

  // `[` toggles the sidebar — but not while someone is typing a `[`.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "[" || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")
      ) {
        return;
      }
      event.preventDefault();
      toggleCollapsed();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleCollapsed]);

  return (
    <ReservationDetailProvider>
      <CommandPalette pendingCount={pendingCount} />
      <div className="tabular-shell bg-background flex min-h-screen">
        {/*
          The floating rail. The aside is a transparent, sticky, full-height
          padding frame; the charcoal panel floats inside it with the bench
          showing on all four sides. This is the personality move — a black
          rail on a warm bench is a silhouette no reference product shares —
          and it keeps the sidebar fully opaque, so the black in
          black-white-red stays black. (Glass here would be inert anyway:
          nothing scrolls behind a flex-column sidebar.)
        */}
        <aside
          className={cn(
            "sticky top-0 hidden h-screen shrink-0 p-3 transition-[width] duration-[var(--motion-panel)] ease-[var(--ease-standard)] lg:block",
            collapsed ? "w-[88px]" : "w-[264px]"
          )}
        >
          <div className="bg-sidebar text-sidebar-foreground relative flex h-full flex-col overflow-hidden rounded-[20px] shadow-lg">
            <SidebarChrome
              user={user}
              signOutAction={signOutAction}
              pendingCount={pendingCount}
              collapsed={collapsed}
            />
          </div>
          {/* Sits on the rail's right edge, outside the clipped panel. */}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={`${collapsed ? "Expand" : "Collapse"} sidebar  [`}
            className="bg-sidebar border-sidebar-border text-sidebar-foreground/60 hover:text-sidebar-foreground absolute top-[84px] right-0 z-20 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border shadow-sm transition-colors"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-3 w-3" />
            ) : (
              <PanelLeftClose className="h-3 w-3" />
            )}
          </button>
        </aside>

        {/* Mobile drawer — never collapsed; on a phone there is no in-between. */}
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0 bg-black/50"
              onClick={() => setOpen(false)}
            />
            <aside className="bg-sidebar text-sidebar-foreground animate-in slide-in-from-left absolute inset-y-0 left-0 flex w-72 flex-col shadow-xl duration-200">
              <button
                type="button"
                aria-label="Close menu"
                className="text-sidebar-foreground/70 absolute top-4 right-4"
                onClick={() => setOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
              <SidebarChrome
                user={user}
                signOutAction={signOutAction}
                pendingCount={pendingCount}
              />
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile topbar — glass, because content genuinely scrolls under
              it here (unlike the desktop rail). Translucent charcoal, not the
              light popover glass: the bar is the brand surface and its text is
              near-white, which would vanish on a light frost. */}
          <header className="text-sidebar-foreground sticky top-0 z-40 flex h-14 items-center justify-between border-b border-white/10 bg-[color-mix(in_srgb,var(--sidebar)_82%,transparent)] px-4 backdrop-blur-xl lg:hidden">
            <p className="font-display font-bold">
              ALFA <span className="text-sidebar-primary">RENT</span>
            </p>
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setOpen(true)}
              className="relative"
            >
              <Menu className="h-5 w-5" />
              {pendingCount > 0 && (
                <span className="bg-brand absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white">
                  {pendingCount}
                </span>
              )}
            </button>
          </header>

          {/* The ceiling moved into PageBody (per page). The banner keeps it
              here so alerts align with page content; :empty guards the margin
              when nothing is showing. The calendar opts out and runs full-width. */}
          <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
            <div className="mx-auto w-full max-w-[1440px] [&:not(:empty)]:mb-6">
              {banner}
            </div>
            {children}
          </main>
        </div>
      </div>
    </ReservationDetailProvider>
  );
}
