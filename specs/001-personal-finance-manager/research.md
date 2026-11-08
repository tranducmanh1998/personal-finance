# Research: Personal Finance Manager

**Date**: 2026-11-05

## Decisions

### Next.js application and authentication

- **Decision**: Use one Next.js App Router application for UI and server-side finance operations. Use Better Auth as the maintained self-hosted authentication candidate; enable email/password, disable sign-up at the auth/API configuration, and provision the initial account through a controlled operator procedure. Perform authorization in the server-side data access layer.
- **Rationale**: This meets the single-user, no-public-registration requirement without a custom password/session implementation or a separately deployed API. Next.js recommends using an authentication library and describes a data access layer for secure checks. Better Auth documents a Next.js integration and a `disableSignUp` option.
- **Alternatives considered**: Custom authentication is rejected. A hosted identity provider remains possible if the operator chooses to accept the external dependency and account provisioning model.
- **Sources**: [Next.js authentication guide](https://nextjs.org/docs/app/guides/authentication); [Better Auth Next.js integration](https://www.better-auth.com/docs/integrations/next); [Better Auth options](https://www.better-auth.com/docs/reference/options).

### TypeScript data access and PostgreSQL

- **Decision**: Use PostgreSQL with Drizzle ORM and the `node-postgres` (`pg`) driver. Keep schema and migrations version-controlled; financial domain logic stays in server-side feature services.
- **Rationale**: Drizzle has native PostgreSQL support and works with `node-postgres`; its TypeScript schema offers a small, direct data layer suitable for a single application. PostgreSQL provides durable relational constraints and exact numeric types.
- **Alternatives considered**: Hand-written SQL is possible but would require more repeated mapping/validation; a larger ORM is not necessary for this scope. Re-evaluate only if requirements justify it.
- **Sources**: [Drizzle PostgreSQL setup](https://orm.drizzle.team/docs/get-started-postgresql); [PostgreSQL numeric types](https://www.postgresql.org/docs/current/datatype-numeric.html); [PostgreSQL date/time types](https://www.postgresql.org/docs/current/datatype-datetime.html).

### Exact financial amounts

- **Decision**: Store current VND whole-đồng amounts as PostgreSQL `BIGINT`, with explicit transaction/payment direction and exact integer arithmetic. Use `NUMERIC(p,s)` only if fractional currency units become a confirmed requirement. Do not convert amounts to floating-point for calculations.
- **Rationale**: PostgreSQL documents integer types as exact and `numeric` as exact but slower. Big integers need careful serialization at JavaScript boundaries because `number` is not exact over the full integer range.
- **Alternatives considered**: Floating-point is rejected for finance. `NUMERIC` is a valid alternative if fractional amounts are required.
- **Source**: [PostgreSQL numeric types](https://www.postgresql.org/docs/current/datatype-numeric.html).

### VPS deployment and separation

- **Decision**: Run the app and PostgreSQL in a uniquely named Docker Compose project with its own private default network and named database volume. Publish only the web entry point to the chosen reverse proxy; do not publish PostgreSQL or share networks/host networking with the trading bot.
- **Rationale**: Compose project naming and project-scoped default networks separate the application's containers/resources. Next.js recommends placing a reverse proxy in front of a self-hosted server. A small app plus database is a low-complexity starting point.
- **Alternatives considered**: A shared Compose project/network is rejected because the VPS already hosts a trading bot. Separate managed database services or additional proxy containers are unnecessary unless the VPS topology requires them.
- **Sources**: [Compose project names](https://docs.docker.com/compose/how-tos/project-name/); [Compose networking](https://docs.docker.com/compose/how-tos/networking/); [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting); [Next.js output configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js/output); [Compose startup order and health checks](https://docs.docker.com/compose/how-tos/startup-order/).

### Backup and restore

- **Decision**: Persist PostgreSQL in a named volume and schedule custom-format `pg_dump` backups. Keep encrypted copies off-host, document retention/recovery objectives, and rehearse restore with `pg_restore`. Treat this operational backup separately from user-facing data export.
- **Rationale**: This is a practical backup and restore path for a small single-host database. A Docker volume survives container replacement but is not itself an off-host backup. PostgreSQL's native dump/restore tools and an encrypted backup repository are established options.
- **Alternatives considered**: Continuous WAL archiving/point-in-time recovery provides tighter recovery points but adds operational complexity; use only if confirmed recovery objectives require it. A downloadable export alone is not a substitute for tested server backup.
- **Sources**: [Docker volumes](https://docs.docker.com/engine/storage/volumes/); [`pg_dump`](https://www.postgresql.org/docs/current/app-pgdump.html); [`pg_restore`](https://www.postgresql.org/docs/current/app-pgrestore.html); [PostgreSQL backup overview](https://www.postgresql.org/docs/current/backup.html); [restic introduction](https://restic.readthedocs.io/en/stable/010_introduction.html); [restic encryption](https://restic.readthedocs.io/en/stable/070_encryption.html).

### Monthly Excel report

- **Decision**: Generate a downloadable `.xlsx` report for a selected closed month using a maintained TypeScript spreadsheet library such as ExcelJS. Include the monthly cash-flow transaction detail and the detailed per-debt closing balance after that month's recorded payments. Do not support restoring from this report.
- **Rationale**: The user requested an Excel monthly report, not a data migration/restore workbook. Generate it from the immutable monthly snapshot so historical totals stay stable.
- **Alternatives considered**: CSV is not an Excel workbook and does not provide the requested multi-section report. Operational PostgreSQL dumps remain the recovery mechanism.
- **Source**: [ExcelJS](https://github.com/exceljs/exceljs).

## Decisions intentionally not made

The business decisions initially left open in the specification have since been clarified by the user. Their approved behavior is recorded in [spec.md](./spec.md) and [data-model.md](./data-model.md).
