"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import { Tooltip } from "@base-ui/react/tooltip";
import {
  ChevronLeft,
  ChevronRight,
  KeyRound,
  LogOut,
  Menu,
  Search,
  X,
} from "lucide-react";
import { AdminNav } from "./admin-nav";
import { CommandPalette } from "./command-palette";
import { ReservationDetailProvider } from "./reservation-detail";
import { Toaster } from "@/components/dashboard/toaster";
import {
  SIDEBAR_COLLAPSED,
  SIDEBAR_COOKIE,
  SIDEBAR_MAX_AGE,
} from "./sidebar-state";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { LanguageSelector } from "@/components/shared/language-selector";
import { useI18n } from "@/components/shared/locale-provider";
import { Button } from "@/components/ui/button";
import { ShortcutHint } from "@/components/shared/shortcut-hint";
import { cn } from "@/lib/utils";
import { ROLE_KEYS } from "@/lib/status-labels";
import { Sheet, SheetClose, SheetContent } from "@/components/ui/sheet";

type ShellUser = { name: string; role: Role };

function SidebarChrome({
  user,
  signOutAction,
  pendingCount,
  collapsed = false,
  onToggleCollapsed,
  onSearch,
}: {
  user: ShellUser;
  signOutAction: () => Promise<void>;
  pendingCount: number;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onSearch: () => void;
}) {
  const { t } = useI18n();
  const collapseLabel = collapsed
    ? t("admin.expandSidebar")
    : t("admin.collapseSidebar");
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
          // The `[` shortcut used to hide at the end of a title attribute,
          // after two spaces. A tooltip says it properly, and
          // aria-keyshortcuts says it to a screen reader.
          <Tooltip.Provider delay={400}>
            <Tooltip.Root>
              <Tooltip.Trigger
                render={
                  <button
                    type="button"
                    onClick={onToggleCollapsed}
                    aria-label={collapseLabel}
                    aria-keyshortcuts="["
                    className={cn(
                      "border-sidebar-border text-sidebar-foreground/60 hover:text-sidebar-foreground hit-area relative flex shrink-0 cursor-pointer items-center justify-center rounded-none border transition-colors hover:bg-white/8",
                      collapsed ? "h-6 w-6" : "h-7 w-7"
                    )}
                  />
                }
              >
                {collapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Positioner side="right" sideOffset={10}>
                  <Tooltip.Popup className="bg-popover text-popover-foreground flex items-center gap-2 rounded-none border px-2.5 py-1.5 text-xs font-medium shadow-md">
                    {collapseLabel}
                    <ShortcutHint keys={["["]} />
                  </Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>
        )}
      </div>

      {/* The palette's front door. ⌘K alone left it undiscoverable, and on
          a phone, with no keyboard, unreachable. */}
      <div className={cn("px-3 pt-3", collapsed && "px-2")}>
        <button
          type="button"
          onClick={onSearch}
          aria-label={collapsed ? t("admin.search") : undefined}
          aria-keyshortcuts="Meta+K Control+K"
          className={cn(
            "border-sidebar-border text-sidebar-foreground/65 hover:text-sidebar-foreground flex w-full cursor-pointer items-center rounded-none border text-sm transition-colors hover:bg-white/5",
            collapsed ? "h-10 justify-center" : "h-10 gap-3 px-3"
          )}
        >
          <Search className="h-4 w-4 shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{t("admin.search")}</span>
              <ShortcutHint keys={["mod", "K"]} />
            </>
          )}
        </button>
      </div>

      <AdminNav
        pendingCount={pendingCount}
        collapsed={collapsed}
        isAdmin={user.role === "ADMIN"}
      />

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
              {t(ROLE_KEYS[user.role])}
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
        {/* Outside /admin, so it is a plain link: the page has its own frame,
            like sign-in, and works for a temporary password too. */}
        <Link
          href="/account/password"
          aria-label={collapsed ? t("admin.changePassword") : undefined}
          title={collapsed ? t("admin.changePassword") : undefined}
          className={cn(
            "border-sidebar-border text-sidebar-foreground/65 hover:text-sidebar-foreground hit-area relative mb-2 flex h-8 w-full items-center gap-2 rounded-none border transition-colors hover:bg-white/8",
            collapsed
              ? "justify-center px-0"
              : "justify-start px-2.5 text-xs font-semibold"
          )}
        >
          <KeyRound className="h-4 w-4 shrink-0" />
          {!collapsed && <span>{t("admin.changePassword")}</span>}
        </Link>
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
              "border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground w-full bg-transparent",
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
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Search chosen from the phone menu waits for the menu to finish closing:
  // the closing sheet hands focus back to its trigger, which would pull it
  // straight out of the palette's input and drop the keyboard.
  const searchAfterMenu = useRef(false);
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
    <Toaster>
      <ReservationDetailProvider>
        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          pendingCount={pendingCount}
          isAdmin={user.role === "ADMIN"}
        />
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
              "sticky top-0 hidden h-screen shrink-0 p-3 lg:block",
              collapsed ? "w-[88px]" : "w-[264px]"
            )}
          >
            <div className="bg-sidebar text-sidebar-foreground relative flex h-full flex-col overflow-hidden rounded-none shadow-lg">
              <SidebarChrome
                user={user}
                signOutAction={signOutAction}
                pendingCount={pendingCount}
                collapsed={collapsed}
                onToggleCollapsed={toggleCollapsed}
                onSearch={() => setPaletteOpen(true)}
              />
            </div>
          </aside>

          {/* Mobile drawer — never collapsed; on a phone there is no in-between. */}
          <Sheet
            side="left"
            open={open}
            onOpenChange={setOpen}
            onOpenChangeComplete={(isOpen) => {
              if (isOpen || !searchAfterMenu.current) return;
              searchAfterMenu.current = false;
              setPaletteOpen(true);
            }}
          >
            <SheetContent
              showCloseButton={false}
              className="bg-sidebar text-sidebar-foreground border-sidebar-border w-72 gap-0 lg:hidden"
            >
              <SheetClose
                aria-label={t("admin.closeMenu")}
                className="text-sidebar-foreground/70 hover:text-sidebar-foreground absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-none transition-colors"
              >
                <X className="h-5 w-5" />
              </SheetClose>
              <SidebarChrome
                user={user}
                signOutAction={signOutAction}
                pendingCount={pendingCount}
                onSearch={() => {
                  searchAfterMenu.current = true;
                  setOpen(false);
                }}
              />
            </SheetContent>
          </Sheet>

          <div className="flex min-w-0 flex-1 flex-col">
            {/* Mobile topbar — glass, because content genuinely scrolls under
              it here (unlike the desktop rail). Translucent charcoal, not the
              light popover glass: the bar is the brand surface and its text is
              near-white, which would vanish on a light frost. */}
            {/* content-box, so the bar keeps its 56px of content and grows
                by the top inset where the page runs under the status bar.
                Both buttons are full 44px targets; the menu button was the
                bare 20px icon. */}
            <header className="text-sidebar-foreground border-sidebar-border sticky top-0 z-40 box-content flex h-14 items-center justify-between border-b bg-[color-mix(in_srgb,var(--sidebar)_88%,transparent)] px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:hidden">
              <p className="font-display font-bold">
                ALFA <span className="text-sidebar-primary">RENT</span>
              </p>
              <div className="-mr-2 flex items-center">
                <button
                  type="button"
                  aria-label={t("admin.search")}
                  onClick={() => setPaletteOpen(true)}
                  className="flex h-11 w-11 cursor-pointer items-center justify-center"
                >
                  <Search className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  aria-label={t("admin.openMenu")}
                  onClick={() => setOpen(true)}
                  className="relative flex h-11 w-11 cursor-pointer items-center justify-center"
                >
                  <Menu className="h-5 w-5" />
                  {pendingCount > 0 && (
                    <span className="bg-brand absolute top-1.5 right-1 flex h-4 min-w-4 items-center justify-center rounded-none px-1 text-[10px] font-bold text-white tabular-nums">
                      {pendingCount}
                    </span>
                  )}
                </button>
              </div>
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
    </Toaster>
  );
}
