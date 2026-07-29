"use client";

import { format } from "date-fns";
import { useDetailDrawer } from "@/app/(dashboard)/admin/reservation-detail";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Item = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  createdAt: Date;
  notes: string | null;
};

/** Customer rows open the shared drawer rather than a separate page. */
export function CustomerList({ items }: { items: Item[] }) {
  const { openCustomer } = useDetailDrawer();

  return (
    <>
      <ul className="divide-y md:hidden">
        {items.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => openCustomer(c.id)}
              className="hover:bg-surface-hover w-full cursor-pointer rounded-lg px-2 py-3 text-left transition-colors"
            >
              <p className="text-sm font-semibold">
                {c.firstName} {c.lastName}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {c.email} - {c.phone}
              </p>
            </button>
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
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
            {items.map((c) => (
              <TableRow
                key={c.id}
                onClick={() => openCustomer(c.id)}
                className="hover:bg-surface-hover cursor-pointer transition-colors"
              >
                <TableCell className="font-medium">
                  {c.firstName} {c.lastName}
                </TableCell>
                <TableCell>{c.email}</TableCell>
                <TableCell>{c.phone}</TableCell>
                <TableCell>{format(c.createdAt, "dd MMM yyyy")}</TableCell>
                <TableCell className="text-muted-foreground max-w-56 truncate">
                  {c.notes ?? ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
