import { PageBody } from "../page-body";
import {
  PageHeaderSkeleton,
  PanelSkeleton,
  RowsSkeleton,
} from "@/components/dashboard/skeletons";

/** Staff: header with its Add button, then the accounts list. */
export default function StaffLoading() {
  return (
    <PageBody aria-busy="true">
      <PageHeaderSkeleton action />
      <PanelSkeleton>
        <RowsSkeleton rows={4} />
      </PanelSkeleton>
    </PageBody>
  );
}
