import { format } from "date-fns";
import { requireUser } from "@/lib/auth/guards";
import { getDashboardStats } from "@/services/dashboard.service";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireUser();
  const stats = await getDashboardStats();

  const cards = [
    { label: "Total vehicles", value: stats.totalVehicles },
    { label: "Available now", value: stats.availableVehicles },
    { label: "Active rentals", value: stats.activeRentals },
    { label: "Pending requests", value: stats.pendingRequests },
    { label: "Revenue", value: `${stats.revenue.toFixed(2)} EUR` },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium">
                {card.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent reservations</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Pickup</TableHead>
                <TableHead>Return</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.recentReservations.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    {r.customer.firstName} {r.customer.lastName}
                  </TableCell>
                  <TableCell>
                    {r.vehicle.brand} {r.vehicle.model}
                  </TableCell>
                  <TableCell>{format(r.pickupDate, "dd MMM yyyy")}</TableCell>
                  <TableCell>{format(r.returnDate, "dd MMM yyyy")}</TableCell>
                  <TableCell>{Number(r.totalPrice).toFixed(2)} EUR</TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
