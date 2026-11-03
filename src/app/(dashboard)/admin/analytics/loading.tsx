import { PageBody } from "../page-body";
import {
  ChartSkeleton,
  PageHeaderSkeleton,
  PanelSkeleton,
  StatStripSkeleton,
} from "@/components/dashboard/skeletons";

/** Analytics: figures, two trend charts, then the three breakdowns. */
export default function AnalyticsLoading() {
  return (
    <PageBody aria-busy="true">
      <PageHeaderSkeleton action />
      <StatStripSkeleton count={7} />
      <div className="grid gap-4 lg:grid-cols-2">
        <PanelSkeleton>
          <ChartSkeleton />
        </PanelSkeleton>
        <PanelSkeleton>
          <ChartSkeleton />
        </PanelSkeleton>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <PanelSkeleton key={index}>
            <ChartSkeleton height={140} />
          </PanelSkeleton>
        ))}
      </div>
    </PageBody>
  );
}
