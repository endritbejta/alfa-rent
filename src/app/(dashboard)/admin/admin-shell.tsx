"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { AdminNav } from "./admin-nav";
import { Button } from "@/components/ui/button";

type ShellUser = { name: string; role: string };

function SidebarChrome({
  user,
  signOutAction,
}: {
  user: ShellUser;
  signOutAction: () => Promise<void>;
}) {
  return (
    <>
      <div className="border-sidebar-border border-b p-5">
        <p className="font-display text-lg font-bold tracking-tight">
          ALFA <span className="text-sidebar-primary">RENT</span>
        </p>
        <p className="text-sidebar-foreground/50 text-xs">Staff dashboard</p>
      </div>
      <AdminNav />
      <div className="border-sidebar-border border-t p-4">
        <p className="truncate text-sm">{user.name}</p>
        <p className="text-sidebar-foreground/50 mb-3 text-xs">{user.role}</p>
        <form action={signOutAction}>
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="w-full border-neutral-700 bg-transparent text-neutral-200 hover:bg-white/8 hover:text-white"
          >
            Sign out
          </Button>
        </form>
      </div>
    </>
  );
}

export function AdminShell({
  user,
  signOutAction,
  children,
}: {
  user: ShellUser;
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer on navigation.
  useEffect(() => {
    const timer = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(timer);
  }, [pathname]);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border hidden w-60 shrink-0 flex-col border-r lg:flex">
        <SidebarChrome user={user} signOutAction={signOutAction} />
      </aside>

      {/* Mobile drawer */}
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
            <SidebarChrome user={user} signOutAction={signOutAction} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile topbar */}
        <header className="bg-sidebar text-sidebar-foreground sticky top-0 z-40 flex h-14 items-center justify-between px-4 lg:hidden">
          <p className="font-display font-bold">
            ALFA <span className="text-sidebar-primary">RENT</span>
          </p>
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
        </header>

        <main className="bg-background min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
