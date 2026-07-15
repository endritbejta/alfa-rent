import { requireUser } from "@/lib/auth/guards";
import { signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { AdminNav } from "./admin-nav";

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
      <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border flex w-60 shrink-0 flex-col border-r">
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
              className="w-full border-neutral-700 bg-transparent text-neutral-200 hover:bg-white/8 hover:text-white"
            >
              Sign out
            </Button>
          </form>
        </div>
      </aside>
      <main className="bg-background flex-1 overflow-x-auto p-8">
        {children}
      </main>
    </div>
  );
}
