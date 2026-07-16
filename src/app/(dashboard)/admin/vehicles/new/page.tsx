import { requireRole } from "@/lib/auth/guards";
import { VehicleForm } from "@/components/forms/vehicle-form";
import { createVehicleAction } from "../actions";

export default async function NewVehiclePage() {
  await requireRole("ADMIN");

  return (
    <div className="space-y-6">
      <VehicleForm action={createVehicleAction} />
    </div>
  );
}
