# Alfa Rent docs

Long-lived documentation. Start with [`HANDOFF.md`](../HANDOFF.md) for the
current state of the project and [`README.md`](../README.md) for setup.

## Operations

- [Backup and restore runbook](runbooks/backup-and-restore.md) — where the
  backups are, how to restore without touching production, and how to verify
  the database objects Prisma does not model.
- [Online payments](online-payments.md) — the staged payment design and the
  gates that keep it disabled.

## Audits

Point-in-time records. Each describes the code as it was on its date; check
the code before acting on a finding.

| Date        | Document                                                   | What it is                                                                              |
| ----------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 27 Aug 2026 | [Engineering audit](audit/ALFA-RENT-ENGINEERING-AUDIT.md)  | The canonical audit: scores, findings, roadmap, and "Things that should NOT be changed" |
| 27 Aug 2026 | [Phase reports 1–10](audit/PHASE-1-ARCHITECTURE-MAP.md)    | The evidence behind each section of the audit                                           |
| 27 Aug 2026 | [Audit handoff](audit/AUDIT-HANDOFF-2026-08-27.md)         | The continuation brief written with the audit; open questions in §19                    |
| 26 Oct 2026 | [Admin panel audit](audit/ADMIN-PANEL-AUDIT-2026-10-26.md) | A runtime audit of `/admin/*` as ADMIN and EMPLOYEE                                     |

The July 2026 production-readiness audit, performance audit, design proposal
and cleanup plan were removed once the audits above superseded them. Read
them in git history, e.g. `git show e5f7a02:AUDIT_REPORT.md`,
`git show e5f7a02:PERFORMANCE_AUDIT.md` or
`git show e5f7a02:plans/001-production-cleanup-audit.md`.
