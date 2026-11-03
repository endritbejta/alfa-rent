import { PageBody } from "../page-body";
import {
  PageHeaderSkeleton,
  PanelSkeleton,
  PillsSkeleton,
  RowsSkeleton,
} from "@/components/dashboard/skeletons";

/** The reservations list: header, status control, then the table. */
export default function ReservationsLoading() {
  return (
    <PageBody aria-busy="true">
      <PageHeaderSkeleton />
      <PillsSkeleton count={6} />
      <PanelSkeleton>
        <RowsSkeleton rows={10} />
      </PanelSkeleton>
    </PageBody>
  );
}
