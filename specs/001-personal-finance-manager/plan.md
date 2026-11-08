# Implementation Plan: Personal Finance Manager

**Branch**: `001-personal-finance-manager` | **Date**: 2026-11-05 | **Spec**: [spec.md](./spec.md)

**Input**: Approved feature requirements in `spec.md` and the implementation constraints supplied with `/speckit-plan`.

## Summary

Build a private, Vietnamese-language personal finance web application for one account. A responsive Next.js App Router application provides the UI and server-side operations, with PostgreSQL as persistent storage. Use a maintained authentication library with public sign-up disabled, exact integer đồng amounts, and a small Docker Compose deployment isolated from the existing trading bot. Financial summaries are derived from canonical transaction, debt, payment, plan, and goal records; related mutations that span records are atomic.

The approved specification's features are retained without additions. Business rules clarified during planning are recorded in `spec.md`, `data-model.md`, and the corresponding implementation tasks.

## Technical Context

**Language/Version**: TypeScript, Node.js LTS (pin the supported version at implementation time)

**Primary Dependencies**: Next.js App Router; Better Auth (self-hosted, email/password enabled, sign-up disabled); Drizzle ORM and node-postgres (`pg`); PostgreSQL; ExcelJS for monthly `.xlsx` reports. Pin maintained stable releases when implementation begins.

**Storage**: PostgreSQL; `BIGINT` whole-đồng values for financial amounts; date-only values for due dates and calendar days, timestamps for events.

**Testing**: Vitest for domain/unit tests; PostgreSQL-backed integration tests for persistence and transaction atomicity; Playwright for responsive end-to-end flows and authentication; Docker Compose smoke check and backup/restore rehearsal.

**Target Platform**: Development in GitHub Codespaces; Linux VPS running Docker Compose; browser clients on desktop and mobile.

**Project Type**: Single Next.js web application (UI and server-side backend) plus PostgreSQL.

**Performance Goals**: Meet spec outcomes: common dashboard view under one minute from update and ordinary key tasks under three minutes. Keep database and application resource use appropriate for one account; validate with representative data rather than asserting unsupported throughput targets.

**Constraints**: Vietnamese UI; one provisioned user and no public registration; secure all financial reads and writes server-side; exact financial arithmetic (never floating-point); secrets and real financial data stay out of Git; separate Compose project and networks from the trading bot; low operational complexity; backup must be restorable.

**Scale/Scope**: One household/account, a single VPS deployment, the screens and behaviors in `spec.md`; no public sign-up or multi-account product scope in this release.

## Constitution Check

The checked-in constitution is still the unfilled template with placeholder principles and governance. It supplies no enforceable project-specific gates. The proposal follows the stated constraints: one web project, a relational database, standard maintained libraries, and no additional service or deployment stack. Gate: **PASS (no defined constitution principles to evaluate)**.

**Post-design re-check**: The data model, contracts, and deployment design still introduce no additional service or conflict with the stated constraints. Gate: **PASS**.

## Project Structure

### Documentation (this feature)

```text
specs/001-personal-finance-manager/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── application.md
```

### Source Code (repository root)

```text
app/
├── (auth)/
│   └── login/
├── (finance)/
│   ├── dashboard/
│   ├── assets/
│   ├── transactions/
│   ├── debts/
│   ├── cash-flow/
│   ├── goals/
│   └── history/
└── api/
    └── auth/[...all]/
src/
├── components/          # Shared responsive UI
├── db/                  # Drizzle schema, migrations, connection
├── features/            # Finance domain services and validation
├── lib/                 # Auth, access control, formatting
└── i18n/                # Vietnamese messages and formatting
tests/
├── unit/
├── integration/
└── e2e/
drizzle/                 # Generated, reviewed PostgreSQL migrations
compose.yaml             # Isolated Compose project: app and database
Dockerfile
```

**Structure Decision**: Use one Next.js application and a small internal feature/domain structure; do not split frontend/backend into separately deployed services. Server-side domain services and database access remain behind authenticated server actions or route handlers. PostgreSQL is the only persistent application service. `compose.yaml` has a unique project name, app/database-only private network, persistent database volume, and no published database port; route the app through the VPS's existing reverse-proxy arrangement without sharing the trading bot's network.

## Design Decisions

- **Authentication and access**: Better Auth is a maintained self-hosted library candidate with Next.js integration and a `disableSignUp` control. Disable registration at the auth/API layer, provision the initial account through a controlled operator-only process, and authorize reads/writes in server-side data access rather than relying on hidden UI routes.
- **Money**: Store VND amounts as PostgreSQL `BIGINT`; transaction values may be signed for corrections, with income/expense direction represented separately and validated against category kind. Keep values as integer strings/BigInt at boundaries where JavaScript `number` could lose precision.
- **Net worth**: Include only user-entered cash, savings-deposit, and cash-equivalent balances, less total debt balance. Initial amounts are entered manually; each later period the user enters a fresh balance for each asset type and the application calculates the total.
- **Transactions and savings**: Signed exact-integer transaction amounts are allowed for adjustments. Kind must match a category; use a matching “Khác” category otherwise. The expense category designated for money given to the user's mother is the monthly-savings measure, displayed separately but included in expenses. Debt principal is tracked separately and excluded from expense/savings totals.
- **Data consistency**: Transactions that change multiple canonical records (including debt payment plus its linked transaction and monthly close snapshots) execute in a database transaction. Dashboard/report totals are derived from canonical data rather than independently edited counters.
- **Calendar**: Persist date-only due dates and planned calendar dates separately from creation/update timestamps. Monthly recurrence skips dates that do not exist; month boundaries use the system calendar from 00:00 on day one to 00:00 on the following month's first day.
- **Weekly availability**: Weeks run Monday through Sunday. Use the user's entered cash, savings-deposit, and cash-equivalent balances at the start of the month as the opening balance, apply planned/actual income and expenses and full debt payments by date, and carry each week's closing balance forward to the next week in that month. For a week crossing a month boundary, calculate each month's portion from that month's entered opening balances.
- **History**: After a user explicitly confirms the initial backfill range, authenticated application requests idempotently catch up immutable monthly snapshots through the latest ended month; never close the current or a future month. Include transaction cash flow/category labels, asset balances, and per-debt balances after recorded payments. A missing dated debt anchor remains unknown, not inferred from current balance. Reject mutations to closed periods, show current-month transactions in the live list, and provide monthly Excel reports from saved snapshots.
- **Deployment**: Build a standalone Next.js container, run PostgreSQL in the same separately named Compose project with a named volume and health check, publish only the web entry point, and keep secrets in host-managed environment/secrets files excluded from version control.
- **Backups**: Treat database backup/restore as an operational responsibility distinct from the user-facing export requirement. Schedule PostgreSQL custom-format dumps, copy encrypted backups off-host, define retention and recovery objectives with the operator, and periodically test restore.

## Open Product Decisions

No open product decisions remain from the answers received so far. Implementation scope and acceptance behavior are recorded in `spec.md` and `data-model.md`.

## Complexity Tracking

No constitution gate violations. No separate backend service, cache, queue, or public multi-user infrastructure is proposed.
