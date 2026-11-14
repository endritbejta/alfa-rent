import { PageBody } from "../page-body";
import {
  ChartSkeleton,
  PageHeaderSkeleton,
  PillsSkeleton,
  StatStripSkeleton,
} from "@/components/dashboard/skeletons";

/**
 * Analytics: the period picker, the four headline figures, then the
 * sections — each a chart beside its breakdown. Shaped like the page so a
 * period change does not make the layout jump.
 */
export default function AnalyticsLoading() {
  return (
    <PageBody aria-busy="true" className="space-y-10">
      <PageHeaderSkeleton action />
      <PillsSkeleton count={8} />
      <StatStripSkeleton count={4} />
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="grid gap-x-10 gap-y-8 border-t pt-6 lg:grid-cols-3"
        >
          <div className="lg:col-span-2">
            <ChartSkeleton height={200} />
          </div>
          <ChartSkeleton height={200} />
        </div>
      ))}
    </PageBody>
  );
}
