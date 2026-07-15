import { requireUser } from "@/lib/auth/guards";
import { signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";

// Minimal placeholder proving the auth boundary; Phase 5 builds the
// real dashboard here.
export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-muted-foreground mt-2">
        Signed in as {user.name} ({user.role})
      </p>
      <form
        className="mt-6"
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </main>
  );
}
