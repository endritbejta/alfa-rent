import { format } from "date-fns";
import { requireUser } from "@/lib/auth/guards";
import { getCustomers } from "@/services/customer.service";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  await requireUser();
  const { items } = await getCustomers({ page: 1, perPage: 50 });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Customers</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Since</TableHead>
            <TableHead>Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((customer) => (
            <TableRow key={customer.id}>
              <TableCell className="font-medium">
                {customer.firstName} {customer.lastName}
              </TableCell>
              <TableCell>{customer.email}</TableCell>
              <TableCell>{customer.phone}</TableCell>
              <TableCell>{format(customer.createdAt, "dd MMM yyyy")}</TableCell>
              <TableCell className="text-muted-foreground max-w-56 truncate">
                {customer.notes ?? ""}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
