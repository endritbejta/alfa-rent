import { PageBody } from "../page-body";
import {
  ChartSkeleton,
  PageHeaderSkeleton,
  PanelSkeleton,
  RowsSkeleton,
  StatStripSkeleton,
} from "@/components/dashboard/skeletons";

/**
 * Streamed while the dashboard waits on the database. Every admin page is
 * force-dynamic, so without a fallback the browser holds a blank screen for
 * the length of the slowest query.
 *
 * Each admin section carries its own, shaped like itself, rather than one at
 * the admin root: a root fallback wraps every section, so a full load of the
 * reservations list streamed the dashboard's outline before its own.
 */
export default function DashboardLoading() {
  return (
    <PageBody aria-busy="true">
      <PageHeaderSkeleton action />
      <StatStripSkeleton count={7} />
      <div className="grid gap-4 lg:grid-cols-3">
        <PanelSkeleton className="lg:col-span-2">
          <ChartSkeleton height={160} />
        </PanelSkeleton>
        <PanelSkeleton>
          <ChartSkeleton height={160} />
        </PanelSkeleton>
      </div>
      <PanelSkeleton>
        <RowsSkeleton rows={5} />
      </PanelSkeleton>
    </PageBody>
  );
}
