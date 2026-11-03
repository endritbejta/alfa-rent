import { PageBody } from "../page-body";
import {
  ChartSkeleton,
  PageHeaderSkeleton,
  PanelSkeleton,
  RowsSkeleton,
  StatStripSkeleton,
} from "@/components/dashboard/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Customers: header, figures, the two insight panels, then the list. */
export default function CustomersLoading() {
  return (
    <PageBody aria-busy="true">
      <PageHeaderSkeleton />
      <StatStripSkeleton count={4} />
      <div className="grid gap-4 lg:grid-cols-2">
        <PanelSkeleton>
          <ChartSkeleton height={140} />
        </PanelSkeleton>
        <PanelSkeleton>
          <ChartSkeleton height={140} />
        </PanelSkeleton>
      </div>
      <PanelSkeleton>
        <Skeleton className="mb-4 h-12 w-full max-w-md" />
        <RowsSkeleton rows={8} />
      </PanelSkeleton>
    </PageBody>
  );
}
