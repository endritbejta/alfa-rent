"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { enUS, sq } from "date-fns/locale";
import { Menu } from "@base-ui/react/menu";
import {
  KeyRound,
  LogOut,
  MoreHorizontal,
  ShieldCheck,
  ShieldOff,
  UserCheck,
  UserX,
} from "lucide-react";
import type { StaffMember } from "@/services/staff.service";
import {
  changeStaffRoleAction,
  deactivateStaffAction,
  reactivateStaffAction,
  resetStaffPasswordAction,
  signOutStaffEverywhereAction,
  type StaffActionResult,
} from "./actions";
import { TemporaryPasswordField } from "./temporary-password-field";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { toasts } from "@/components/dashboard/toaster";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/components/shared/locale-provider";
import {
  generateTemporaryPassword,
  PASSWORD_PROBLEM_TEXT,
  passwordProblem,
} from "@/lib/password-policy";
import { ROLE_KEYS } from "@/lib/status-labels";
import { cn } from "@/lib/utils";

type Ask = "makeAdmin" | "makeEmployee" | "deactivate" | "signOut" | "reset";
type Asking = { kind: Ask; member: StaffMember };

/**
 * The accounts, as a table on wide screens and cards on phones, each with
 * one menu of what can be done to it.
 *
 * Every change that takes something away asks first, through the shared
 * confirmation. Reactivating gives access back and is undone by
 * deactivating, so it does not ask. One dialog serves every row: the menu
 * only says which question to put and about whom.
 *
 * Your own row offers only what is safe to do to yourself. The service
 * refuses the rest anyway.
 */
export function StaffList({
  staff,
  currentUserId,
}: {
  staff: StaffMember[];
  currentUserId: string;
}) {
  const { locale, t } = useI18n();
  const dateLocale = locale === "sq" ? sq : enUS;
  // Kept after the dialog closes, so its words stay put while it fades out.
  const [asking, setAsking] = useState<Asking | null>(null);
  const [open, setOpen] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ask = (kind: Ask, member: StaffMember) => {
    setError(null);
    if (kind === "reset") setTemporaryPassword(generateTemporaryPassword());
    setAsking({ kind, member });
    setOpen(true);
  };

  const reactivate = (member: StaffMember) => {
    startTransition(async () => {
      const result = await reactivateStaffAction({ userId: member.id });
      if (result?.error) {
        toasts.problem(result.error);
        return;
      }
      toasts.success(t("toast.staffReactivated", { name: member.name }));
    });
  };

  const confirm = () => {
    if (!asking) return;
    const { kind, member } = asking;
    if (kind === "reset") {
      const problem = passwordProblem(temporaryPassword);
      if (problem) {
        const { key, values } = PASSWORD_PROBLEM_TEXT[problem];
        setError(t(key, values));
        return;
      }
    }
    setError(null);
    startTransition(async () => {
      const result = await run(kind, member.id, temporaryPassword);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      const { title, description } = done(t, kind, member.name);
      toasts.success(title, description);
    });
  };

  const question =
    asking && describe(t, asking, asking.member.id === currentUserId);

  const menu = (member: StaffMember) => (
    <RowMenu
      member={member}
      self={member.id === currentUserId}
      disabled={pending}
      onAsk={(kind) => ask(kind, member)}
      onReactivate={() => reactivate(member)}
    />
  );

  return (
    <>
      <ul className="divide-y md:hidden">
        {staff.map((member) => (
          <li key={member.id} className="flex items-start gap-3 px-2 py-3">
            <div className="min-w-0 flex-1">
              <Name member={member} self={member.id === currentUserId} />
              <p className="text-muted-foreground truncate text-xs">
                {member.email}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span>{t(ROLE_KEYS[member.role])}</span>
                <Status member={member} />
              </div>
            </div>
            {menu(member)}
          </li>
        ))}
      </ul>

      {/* The email sits under the name rather than in a column of its own.
          With its own column the table outgrew the panel at 1024px, where
          the sidebar opens, and the row menus scrolled out of sight the
          moment an account showed its temporary-password flag. */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin.name")}</TableHead>
              <TableHead>{t("staff.role")}</TableHead>
              <TableHead>{t("staff.status")}</TableHead>
              <TableHead>{t("staff.added")}</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">{t("admin.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.map((member) => (
              <TableRow
                key={member.id}
                className={cn(!member.active && "text-muted-foreground")}
              >
                <TableCell>
                  <Name member={member} self={member.id === currentUserId} />
                  <span className="text-muted-foreground block text-xs">
                    {member.email}
                  </span>
                </TableCell>
                <TableCell>{t(ROLE_KEYS[member.role])}</TableCell>
                <TableCell className="whitespace-normal">
                  <Status member={member} />
                </TableCell>
                <TableCell className="tabular-nums">
                  {format(member.createdAt, "dd MMM yyyy", {
                    locale: dateLocale,
                  })}
                </TableCell>
                <TableCell className="text-right">{menu(member)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={open}
        title={question?.title ?? ""}
        body={question?.body ?? ""}
        confirmLabel={question?.confirmLabel}
        tone={question?.tone}
        pending={pending}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
      >
        {asking?.kind === "reset" ? (
          <TemporaryPasswordField
            id="staff-reset-password"
            value={temporaryPassword}
            onChange={setTemporaryPassword}
            error={error ?? undefined}
            disabled={pending}
            onEnter={confirm}
          />
        ) : (
          error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )
        )}
      </ConfirmDialog>
    </>
  );
}

type Translate = ReturnType<typeof useI18n>["t"];

/** What the confirmation says for each question. */
function describe(t: Translate, { kind, member }: Asking, self: boolean) {
  const name = member.name;
  switch (kind) {
    case "makeAdmin":
      return {
        title: t("staff.makeAdminTitle", { name }),
        body: t("staff.makeAdminBody"),
        confirmLabel: t("staff.makeAdmin"),
        tone: "neutral" as const,
      };
    case "makeEmployee":
      return {
        title: t("staff.makeEmployeeTitle", { name }),
        body: t("staff.makeEmployeeBody", { name }),
        confirmLabel: t("staff.makeEmployee"),
        tone: "danger" as const,
      };
    case "deactivate":
      return {
        title: t("staff.deactivateTitle", { name }),
        body: t("staff.deactivateBody", { name }),
        confirmLabel: t("staff.deactivate"),
        tone: "danger" as const,
      };
    case "signOut":
      return {
        title: self
          ? t("staff.signOutSelfTitle")
          : t("staff.signOutTitle", { name }),
        body: self
          ? t("staff.signOutSelfBody")
          : t("staff.signOutBody", { name }),
        confirmLabel: t("staff.signOutEverywhere"),
        tone: "danger" as const,
      };
    case "reset":
      return {
        title: t("staff.resetTitle", { name }),
        body: t("staff.resetBody", { name }),
        confirmLabel: t("staff.resetPassword"),
        tone: "danger" as const,
      };
  }
}

/** The toast once it has happened. */
function done(
  t: Translate,
  kind: Ask,
  name: string
): { title: string; description?: string } {
  switch (kind) {
    case "makeAdmin":
    case "makeEmployee":
      return { title: t("toast.staffRoleChanged") };
    case "deactivate":
      return { title: t("toast.staffDeactivated", { name }) };
    case "signOut":
      return { title: t("toast.staffSignedOut", { name }) };
    case "reset":
      return {
        title: t("toast.staffPasswordReset"),
        description: t("toast.staffPasswordResetWhy", { name }),
      };
  }
}

function run(
  kind: Ask,
  userId: string,
  temporaryPassword: string
): Promise<StaffActionResult> {
  switch (kind) {
    case "makeAdmin":
      return changeStaffRoleAction({ userId, role: "ADMIN" });
    case "makeEmployee":
      return changeStaffRoleAction({ userId, role: "EMPLOYEE" });
    case "deactivate":
      return deactivateStaffAction({ userId });
    case "signOut":
      return signOutStaffEverywhereAction({ userId });
    case "reset":
      return resetStaffPasswordAction({ userId, temporaryPassword });
  }
}

function Name({ member, self }: { member: StaffMember; self: boolean }) {
  const { t } = useI18n();
  return (
    <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
      <span className="truncate">{member.name}</span>
      {self && (
        <span className="text-muted-foreground border px-1.5 py-px text-[10px] font-medium tracking-wide uppercase">
          {t("staff.you")}
        </span>
      )}
    </span>
  );
}

function Status({ member }: { member: StaffMember }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-xs font-medium",
          member.active ? "text-status-available" : "text-muted-foreground"
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "h-1.5 w-1.5",
            member.active ? "bg-status-available" : "bg-muted-foreground/50"
          )}
        />
        {member.active ? t("staff.active") : t("staff.deactivated")}
      </span>
      {/* Until they sign in and choose their own, the admin who set it still
          knows it. Worth seeing at a glance. */}
      {member.active && member.mustChangePassword && (
        <span className="text-status-maint bg-status-maint/14 px-1.5 py-0.5 text-[11px] font-medium">
          {t("staff.mustChange")}
        </span>
      )}
    </span>
  );
}

const ITEM =
  "flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm outline-none select-none data-highlighted:bg-surface-hover [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0";

function RowMenu({
  member,
  self,
  disabled,
  onAsk,
  onReactivate,
}: {
  member: StaffMember;
  self: boolean;
  disabled: boolean;
  onAsk: (kind: Ask) => void;
  onReactivate: () => void;
}) {
  const { t } = useI18n();
  return (
    <Menu.Root>
      <Menu.Trigger
        disabled={disabled}
        aria-label={t("staff.actionsFor", { name: member.name })}
        render={<Button variant="ghost" size="icon-sm" className="hit-area" />}
      >
        <MoreHorizontal />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          align="end"
          sideOffset={4}
          className="isolate z-50 outline-none"
        >
          <Menu.Popup className="glass-l4 text-popover-foreground min-w-56 origin-(--transform-origin) rounded-none border py-1 shadow-md outline-hidden transition-[opacity,scale] duration-[var(--motion-hover)] ease-[var(--ease-standard)] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            {self ? (
              <>
                <Menu.LinkItem
                  render={<Link href="/account/password" />}
                  className={ITEM}
                >
                  <KeyRound />
                  {t("admin.changePassword")}
                </Menu.LinkItem>
                <Menu.Item className={ITEM} onClick={() => onAsk("signOut")}>
                  <LogOut />
                  {t("staff.signOutEverywhere")}
                </Menu.Item>
              </>
            ) : (
              <>
                {member.role === "ADMIN" ? (
                  <Menu.Item
                    className={ITEM}
                    onClick={() => onAsk("makeEmployee")}
                  >
                    <ShieldOff />
                    {t("staff.makeEmployee")}
                  </Menu.Item>
                ) : (
                  <Menu.Item
                    className={ITEM}
                    onClick={() => onAsk("makeAdmin")}
                  >
                    <ShieldCheck />
                    {t("staff.makeAdmin")}
                  </Menu.Item>
                )}
                <Menu.Item className={ITEM} onClick={() => onAsk("reset")}>
                  <KeyRound />
                  {t("staff.resetPassword")}
                </Menu.Item>
                {/* A deactivated account has no sessions left to end. */}
                {member.active && (
                  <Menu.Item className={ITEM} onClick={() => onAsk("signOut")}>
                    <LogOut />
                    {t("staff.signOutEverywhere")}
                  </Menu.Item>
                )}
                <Menu.Separator className="bg-border my-1 h-px" />
                {member.active ? (
                  <Menu.Item
                    className={cn(ITEM, "text-destructive")}
                    onClick={() => onAsk("deactivate")}
                  >
                    <UserX />
                    {t("staff.deactivate")}
                  </Menu.Item>
                ) : (
                  <Menu.Item className={ITEM} onClick={onReactivate}>
                    <UserCheck />
                    {t("staff.reactivate")}
                  </Menu.Item>
                )}
              </>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
