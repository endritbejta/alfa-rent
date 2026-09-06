import { requireRole } from "@/lib/auth/guards";
import { getVehicleById } from "@/services/vehicle.service";
import { getVehicleFleetProfile } from "@/services/fleet.service";
import { VehicleForm } from "../../vehicle-form";
import { RepairsPanel } from "./repairs";
import { deleteVehicleAction, updateVehicleAction } from "../../actions";
import { PageBody } from "@/app/(dashboard)/admin/page-body";
import { getI18n } from "@/lib/i18n/server";
import { AlertTriangle } from "lucide-react";

export default async function EditVehiclePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ photos?: string }>;
}) {
  await requireRole("ADMIN");
  const { id } = await params;
  /*
   * createVehicleAction sends the operator here with ?photos=failed when the
   * vehicle saved but its gallery did not. The vehicle genuinely exists at
   * that point, so the previous behaviour — reporting it as a failed create —
   * invited a second submit and a duplicate vehicle. A flag rather than the
   * message itself: the querystring is admin-visible text, and the specific
   * Cloudinary reason is in the error report, not something to act on here.
   */
  const [{ photos }, { t }] = await Promise.all([searchParams, getI18n()]);
  const photosFailed = photos === "failed";

  const [vehicle, profile] = await Promise.all([
    getVehicleById(id),
    getVehicleFleetProfile(id),
  ]);

  const updateWithId = updateVehicleAction.bind(null, id);
  const deleteWithId = deleteVehicleAction.bind(null, id);

  return (
    <PageBody>
      {photosFailed && (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/[0.06] text-destructive mb-5 flex items-start gap-2 rounded-lg border p-4 text-sm"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t("admin.photosNotAttached")}</span>
        </div>
      )}
      <VehicleForm
        action={updateWithId}
        // Decimal cannot cross into a client component — convert at the edge.
        vehicle={{
          id: vehicle.id,
          brand: vehicle.brand,
          model: vehicle.model,
          plate: vehicle.plate,
          year: vehicle.year,
          category: vehicle.category,
          transmission: vehicle.transmission,
          fuelType: vehicle.fuelType,
          seats: vehicle.seats,
          pricePerDay: Number(vehicle.pricePerDay),
          description: vehicle.description,
          status: vehicle.status,
          registrationDate: vehicle.registrationDate,
          registrationExpiry: vehicle.registrationExpiry,
          lastServiceDate: vehicle.lastServiceDate,
          nextServiceDate: vehicle.nextServiceDate,
          serviceNotes: vehicle.serviceNotes,
          images: vehicle.images.map((image) => ({
            id: image.id,
            url: image.url,
          })),
        }}
        onDeleteVehicle={deleteWithId}
        repairsPanel={
          <RepairsPanel
            vehicleId={id}
            repairs={profile.repairs.map((r) => ({
              id: r.id,
              date: r.date,
              cost: String(r.cost),
              description: r.description,
              notes: r.notes,
              reference: r.reference,
            }))}
            stats={profile.stats}
          />
        }
      />
    </PageBody>
  );
}
