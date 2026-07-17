import { requireRole } from "@/lib/auth/guards";
import { VehicleForm } from "@/components/forms/vehicle-form";
import { createVehicleAction } from "../actions";
import { PageBody } from "@/app/(dashboard)/admin/page-body";

export default async function NewVehiclePage() {
  await requireRole("ADMIN");

  return (
    <PageBody>
      <VehicleForm action={createVehicleAction} />
    </PageBody>
  );
}
