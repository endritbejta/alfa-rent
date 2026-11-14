import { PageBody } from "../page-body";
import {
  ChartSkeleton,
  PageHeaderSkeleton,
  PillsSkeleton,
  RowsSkeleton,
  StatStripSkeleton,
} from "@/components/dashboard/skeletons";

/**
 * Analytics, shaped like the page so a period change does not make the
 * layout jump: the reporting toolbar, the four headline figures, the four
 * breakdown modules, then a chart beside its breakdown.
 */
export default function AnalyticsLoading() {
  return (
    <PageBody aria-busy="true" className="space-y-8">
      <div>
        <PageHeaderSkeleton action />
        <div className="bg-card space-y-4 border-b px-5 py-5 sm:px-6">
          <div className="bg-skeleton h-8 w-56" />
          <PillsSkeleton count={8} />
        </div>
      </div>
      <StatStripSkeleton count={4} />
      <div className="grid gap-x-10 gap-y-10 border-t pt-8 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <RowsSkeleton key={index} rows={6} />
        ))}
      </div>
      <div className="grid gap-x-10 gap-y-8 border-t pt-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartSkeleton height={220} />
        </div>
        <ChartSkeleton height={220} />
      </div>
    </PageBody>
  );
}
