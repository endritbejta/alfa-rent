"use client";

import Link from "next/link";
import type { Role } from "@prisma/client";
import { useTheme } from "next-themes";
import { ChevronRight, KeyRound, LogOut, Moon, Settings2 } from "lucide-react";
import { LanguageSelector } from "@/components/shared/language-selector";
import { useI18n } from "@/components/shared/locale-provider";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ROLE_KEYS } from "@/lib/status-labels";

type AccountUser = { name: string; role: Role };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`
      : (parts[0]?.slice(0, 2) ?? "");
  return letters.toUpperCase();
}

/**
 * The sidebar's footer. It used to stack the name, role, theme, language,
 * change password and sign out in a column a third of the sidebar tall, and
 * collapsed it was five unlabelled icons. Now it is one row: who is signed
 * in, and the door to everything about their account.
 */
export function AccountTrigger({
  user,
  collapsed,
  onOpen,
}: {
  user: AccountUser;
  collapsed: boolean;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const role = t(ROLE_KEYS[user.role]);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={`${t("admin.accountSettings")} — ${user.name}, ${role}`}
      title={collapsed ? `${user.name} · ${role}` : undefined}
      className={cn(
        "text-sidebar-foreground hit-area relative flex w-full cursor-pointer items-center rounded-none text-left transition-colors hover:bg-white/8 focus-visible:bg-white/8",
        collapsed ? "h-12 justify-center" : "h-14 gap-3 px-2"
      )}
    >
      <span
        aria-hidden
        className="bg-sidebar-primary text-sidebar-primary-foreground flex h-8 w-8 shrink-0 items-center justify-center text-xs font-bold"
      >
        {initials(user.name)}
      </span>
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{user.name}</span>
            <span className="text-sidebar-foreground/50 block truncate text-xs">
              {role}
            </span>
          </span>
          <Settings2
            aria-hidden
            className="text-sidebar-foreground/60 h-4 w-4 shrink-0"
          />
        </>
      )}
    </button>
  );
}

/** One full-width row: the whole box is the control, not the word in it. */
const rowClass =
  "relative flex h-11 w-full cursor-pointer items-center gap-3 rounded-none border px-3 text-left text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50";

function ThemeRow() {
  const { t } = useI18n();
  const { resolvedTheme, setTheme } = useTheme();
  // The drawer only renders once opened, long after hydration, so the
  // resolved theme is already known here — no mounted guard needed.
  const dark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className={rowClass}
    >
      <Moon aria-hidden className="h-4 w-4 shrink-0" />
      <span className="flex-1">{t("theme.dark")}</span>
      {/* The switch's look; its state is aria-checked on the row itself. */}
      <span
        aria-hidden
        className={cn(
          "relative h-5 w-9 shrink-0 border transition-colors",
          dark ? "bg-foreground border-foreground" : "bg-muted"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3.5 w-3.5 transition-[left]",
            dark ? "bg-background left-[18px]" : "bg-muted-foreground left-0.5"
          )}
        />
      </span>
    </button>
  );
}

export function AccountDrawer({
  user,
  open,
  onOpenChange,
  signOutAction,
}: {
  user: AccountUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signOutAction: () => Promise<void>;
}) {
  const { t } = useI18n();
  return (
    // A dialog: the focus is trapped inside, Esc and an outside press close
    // it, and focus goes back to whatever opened it.
    <Sheet side="right" open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[min(22rem,100vw-2rem)] gap-0 sm:max-w-[22rem]">
        <SheetHeader className="border-b pr-12">
          <SheetTitle>{t("admin.accountSettings")}</SheetTitle>
          <SheetDescription className="flex items-center gap-3 pt-3">
            <span
              aria-hidden
              className="bg-brand flex h-10 w-10 shrink-0 items-center justify-center text-sm font-bold text-white"
            >
              {initials(user.name)}
            </span>
            <span className="min-w-0">
              <span className="text-foreground block truncate font-medium">
                {user.name}
              </span>
              <span className="block truncate text-xs">
                {t(ROLE_KEYS[user.role])}
              </span>
            </span>
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-2 overflow-y-auto p-4">
          <p className="text-muted-foreground pb-1 text-xs font-semibold tracking-wider uppercase">
            {t("admin.preferences")}
          </p>
          <ThemeRow />
          <LanguageSelector variant="row" />

          <p className="text-muted-foreground pt-4 pb-1 text-xs font-semibold tracking-wider uppercase">
            {t("admin.security")}
          </p>
          {/* Outside /admin, so it is a plain link: the page has its own
              frame, like sign-in, and works for a temporary password too. */}
          <Link href="/account/password" className={rowClass}>
            <KeyRound aria-hidden className="h-4 w-4 shrink-0" />
            <span className="flex-1">{t("admin.changePassword")}</span>
            <ChevronRight
              aria-hidden
              className="text-muted-foreground h-4 w-4 shrink-0"
            />
          </Link>
        </div>

        <SheetFooter className="border-t">
          <form action={signOutAction}>
            <button
              type="submit"
              className={cn(rowClass, "text-destructive justify-center")}
            >
              <LogOut aria-hidden className="h-4 w-4 shrink-0" />
              {t("admin.signOut")}
            </button>
          </form>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
