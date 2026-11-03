import { PageBody } from "../../page-body";
import {
  PageHeaderSkeleton,
  PillsSkeleton,
  VehicleGridSkeleton,
} from "@/components/dashboard/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The fleet: header, availability control, filter row, the photo grid.
 * In the (list) group so the vehicle editor pages are not wrapped in it.
 */
export default function VehiclesLoading() {
  return (
    <PageBody aria-busy="true">
      <PageHeaderSkeleton action />
      <PillsSkeleton count={5} />
      <Skeleton className="h-10 w-full max-w-md" />
      <VehicleGridSkeleton count={8} />
    </PageBody>
  );
}
