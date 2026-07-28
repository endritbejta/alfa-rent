"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, LogOut, Menu, X } from "lucide-react";
import { AdminNav } from "./admin-nav";
import { CommandPalette } from "./command-palette";
import { ReservationDetailProvider } from "./reservation-detail";
import {
  SIDEBAR_COLLAPSED,
  SIDEBAR_COOKIE,
  SIDEBAR_MAX_AGE,
} from "./sidebar-state";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { LanguageSelector } from "@/components/shared/language-selector";
import { useI18n } from "@/components/shared/locale-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ShellUser = { name: string; role: string };

function SidebarChrome({
  user,
  signOutAction,
  pendingCount,
  collapsed = false,
  onToggleCollapsed,
}: {
  user: ShellUser;
  signOutAction: () => Promise<void>;
  pendingCount: number;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <div
        className={cn(
          "border-sidebar-border flex items-center justify-between border-b",
          collapsed ? "h-[73px] gap-1 px-1" : "gap-2 p-5"
        )}
      >
        <div className="min-w-0">
          {collapsed ? (
            // The wordmark's own initial, not a new logo. Collapsing the
            // sidebar shouldn't rebrand the product.
            <p className="font-display text-base font-bold">
              A<span className="text-sidebar-primary">R</span>
            </p>
          ) : (
            <>
              <p className="font-display text-lg font-bold tracking-tight">
                ALFA <span className="text-sidebar-primary">RENT</span>
              </p>
              <p className="text-sidebar-foreground/50 text-xs">
                {t("admin.staffDashboard")}
              </p>
            </>
          )}
        </div>
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={
              collapsed ? t("admin.expandSidebar") : t("admin.collapseSidebar")
            }
            title={`${
              collapsed ? t("admin.expandSidebar") : t("admin.collapseSidebar")
            }  [`}
            className={cn(
              "border-sidebar-border text-sidebar-foreground/60 hover:text-sidebar-foreground relative flex shrink-0 cursor-pointer items-center justify-center rounded-lg border transition-colors hover:bg-white/8",
              collapsed ? "h-6 w-6" : "h-7 w-7"
            )}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
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
        <ThemeToggle
          showLabel={!collapsed}
          className={cn("mb-2 w-full", collapsed && "px-0")}
        />
        <LanguageSelector
          compact={collapsed}
          className={cn(
            "text-sidebar-foreground mb-2 w-full",
            collapsed && "justify-center px-1"
          )}
        />
        <form action={signOutAction}>
          <Button
            type="submit"
            variant="outline"
            size="sm"
            aria-label={collapsed ? t("admin.signOut") : undefined}
            title={
              collapsed ? `${t("admin.signOut")} — ${user.name}` : undefined
            }
            className={cn(
              "w-full border-neutral-700 bg-transparent text-neutral-200 hover:bg-white/8 hover:text-white",
              collapsed && "px-0"
            )}
          >
            {collapsed ? (
              <LogOut className="h-3.5 w-3.5" />
            ) : (
              t("admin.signOut")
            )}
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
  const { t } = useI18n();
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
      <div className="tabular-shell flex min-h-screen">
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
              onToggleCollapsed={toggleCollapsed}
            />
          </div>
        </aside>

        {/* Mobile drawer — never collapsed; on a phone there is no in-between. */}
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label={t("admin.closeMenu")}
              className="absolute inset-0 bg-black/50"
              onClick={() => setOpen(false)}
            />
            <aside className="bg-sidebar text-sidebar-foreground animate-in slide-in-from-left absolute inset-y-0 left-0 flex w-72 flex-col shadow-xl duration-200">
              <button
                type="button"
                aria-label={t("admin.closeMenu")}
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
              aria-label={t("admin.openMenu")}
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
