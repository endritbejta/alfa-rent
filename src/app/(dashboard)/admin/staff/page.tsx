import { requireUser } from "@/lib/auth/guards";
import { listStaff } from "@/services/staff.service";
import { PageHeader } from "@/components/dashboard/page-header";
import { Panel } from "@/components/dashboard/panel";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageBody } from "@/app/(dashboard)/admin/page-body";
import { getI18n } from "@/lib/i18n/server";
import { AddStaffDialog } from "./add-staff-dialog";
import { StaffList } from "./staff-list";

export const dynamic = "force-dynamic";

/**
 * Who can sign in, as what, and the levers for taking that away. ADMIN only.
 *
 * An employee who follows a link here is told so, rather than thrown to the
 * error boundary the way a failed guard would, and nothing about the staff is
 * read on their behalf. The page is not the access control, though: every
 * action behind it checks the role again on its own.
 */
export default async function StaffPage() {
  const user = await requireUser();
  const { t } = await getI18n();

  if (user.role !== "ADMIN") {
    return (
      <PageBody>
        <PageHeader title={t("admin.staffNav")} />
        <EmptyState
          title={t("staff.adminsOnly")}
          hint={t("staff.adminsOnlyHint")}
        />
      </PageBody>
    );
  }

  const staff = await listStaff();

  return (
    <PageBody>
      <PageHeader
        title={t("admin.staffNav")}
        description={t("staff.description")}
      >
        <AddStaffDialog />
      </PageHeader>
      <Panel title={t("staff.accounts")} subtitle={t("staff.accountsHint")}>
        <StaffList staff={staff} currentUserId={user.id} />
      </Panel>
    </PageBody>
  );
}
