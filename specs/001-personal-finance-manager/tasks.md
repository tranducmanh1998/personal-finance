# Tasks: Personal Finance Manager

**Input**: Design documents from `/specs/001-personal-finance-manager/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/application.md`, `quickstart.md`

**Tests**: Included because the request explicitly asks for a testing plan. Use fabricated fixtures only; never use real financial or production data in development/test environments.

**Organization**: Tasks are grouped by the five user stories from `spec.md`. Product decisions supplied so far are incorporated into the relevant tasks; no task is currently blocked.

## Phase 1: Setup

**Purpose**: Initialize the single Next.js TypeScript application and developer workflow.

- [X] T001 Initialize the Next.js App Router application with TypeScript and pinned Node.js LTS in `package.json`, `tsconfig.json`, `next.config.ts`, and `app/`.
- [X] T002 [P] Configure ESLint, formatting, and editor defaults in `eslint.config.mjs`, `.prettierrc.json`, and `.editorconfig`.
- [X] T003 [P] Configure the Codespaces development environment in `.devcontainer/devcontainer.json` with the selected Node.js LTS, package manager, and Docker Compose support.
- [X] T004 [P] Add environment-variable placeholders and ignore rules in `.env.example` and `.gitignore`; ensure real credentials and financial records cannot be committed.
- [X] T005 Configure Vitest and Playwright projects and package scripts in `vitest.config.ts`, `playwright.config.ts`, and `package.json`.

**Checkpoint**: A clean Codespace can install dependencies and run the empty app, lint, unit-test, and e2e commands without production secrets.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish database migrations, authenticated ownership, shared UI and synthetic test data before story implementation.

- [X] T006 Configure Drizzle and PostgreSQL connectivity in `drizzle.config.ts` and `src/db/index.ts`; read the database URL only from environment configuration.
- [X] T007 Add migration-generation and migration-apply commands in `package.json` and `src/db/migrate.ts`; migrations must be checked into `drizzle/`.
- [X] T008 Integrate Better Auth with PostgreSQL and server-side sign-up disabled in `src/lib/auth.ts`, `app/api/auth/[...all]/route.ts`, and the required auth schema migration under `drizzle/`.
- [X] T009 Implement server-side session lookup and user-scoped data-access guards in `src/lib/session.ts` and `src/lib/dal.ts`; never authorize from a client-supplied owner ID.
- [X] T010 Implement controlled initial-account provisioning in `scripts/provision-user.ts` and document safe invocation in `README.md`; do not add a public registration flow or commit account credentials.
- [X] T011 Create the shared Vietnamese application shell, login page, and protected finance layout in `app/(auth)/login/page.tsx`, `app/(finance)/layout.tsx`, `src/components/app-shell.tsx`, and `app/globals.css`.
- [X] T012 Add shared server validation, structured domain errors, and safe application logging in `src/lib/validation.ts`, `src/lib/errors.ts`, and `src/lib/logger.ts`.
- [X] T013 Create clearly fake, deterministic fixtures and a test-only loader in `tests/fixtures/finance/`, `tests/fixtures/users/`, and `tests/helpers/seed.ts`; fixtures must not contain actual user or VPS data.

**Checkpoint**: Migrations apply to a disposable PostgreSQL database; the provisioned test user can sign in; unauthenticated finance access is rejected; no test path needs real financial data.

---

## Phase 3: User Story 1 - Theo dõi tình hình tài chính cá nhân (Priority: P1)

**Goal**: Show current and previous-month dashboard totals and income/expense distributions using canonical records.

**Independent Test**: Load fake dated transactions, asset balances, and debt balances into a disposable PostgreSQL database, sign in, and verify dashboard totals, category distributions, and net worth (cash + savings deposits + cash equivalents - debt) against the fixtures.

### Tests for User Story 1

- [x] T014 [P] [US1] Add exact-integer dashboard aggregation tests with fabricated current/previous-month transactions, cash/savings/cash-equivalent balances, and debt balances in `tests/unit/dashboard/summary.test.ts` and `tests/fixtures/finance/dashboard.json`.
- [x] T015 [P] [US1] Add an authenticated dashboard integration test for month selection and category distribution in `tests/integration/dashboard/dashboard.test.ts`.

### Implementation for User Story 1

- [x] T016 [US1] Define the category, signed transaction, and debt baseline columns and constraints in `src/db/schema/finance.ts`, export them from `src/db/schema/index.ts`, and add a migration under `drizzle/`; amounts must use exact `BIGINT`, categories must match transaction kind, and each kind must have a “Khác” category.
- [x] T017 [US1] Implement user-scoped transaction, debt, and monthly-savings category summary queries in `src/features/dashboard/dashboard.repository.ts`, returning exact integer/string amounts without floating-point calculations.
- [x] T018 [US1] Implement current-month and previous-month income, expense, monthly savings, and category-distribution calculations in `src/features/dashboard/dashboard.service.ts`; monthly savings are expenses in the marked category and debt principal is excluded.
- [x] T019 [P] [US1] Build the Vietnamese dashboard page and summary cards in `app/(finance)/dashboard/page.tsx` and `src/features/dashboard/summary-cards.tsx`, using responsive layouts.
- [x] T020 [P] [US1] Build accessible income and expense distribution charts in `src/features/dashboard/distribution-charts.tsx`; provide a readable tabular/text alternative to each chart.
- [x] T021 [US1] Add dated balance entries for cash, savings deposits, and cash equivalents in `src/db/schema/assets.ts` and `src/db/schema/index.ts`; provide Vietnamese input for initial balances and fresh balances each period in `app/(finance)/assets/page.tsx`; calculate net worth as asset balances minus total debt in `src/features/dashboard/dashboard.repository.ts`, `src/features/dashboard/dashboard.service.ts`, and `app/(finance)/dashboard/page.tsx`.
- [x] T022 [US1] Add an expense category marker for the user's monthly savings (money given to their mother) in `src/db/schema/categories.ts` and its editor in `app/(finance)/categories/page.tsx`; calculate it as a separate dashboard metric included in total expense but excluding debt principal in `src/features/dashboard/dashboard.service.ts` and `tests/unit/dashboard/summary.test.ts`.

**Checkpoint**: Dashboard displays exact current/previous-month totals and distributions, plus net worth from fake user-entered asset and debt balances. Monthly savings is a separately displayed expense from the designated category; debt principal is not included.

---

## Phase 4: User Story 2 - Quản lý khoản nợ và thanh toán định kỳ (Priority: P1)

**Goal**: Create, review, edit, and delete debt records; expose due dates, balances, periodic due amounts, and linked payment updates.

**Independent Test**: With fake debt records, verify list and totals, due/payment-period display, create/edit/delete behavior, record a full on-time payment by entering principal and interest, and confirm the debt balance and dashboard update. Verify settled debts can be deleted without removing closed monthly history.

### Tests for User Story 2

- [x] T023 [P] [US2] Add debt CRUD and due-amount integration tests using fabricated debt records in `tests/integration/debts/debt-crud.test.ts`.
- [x] T024 [P] [US2] Add debt form validation tests for exact integer amount serialization and required debt fields in `tests/unit/debts/debt-validation.test.ts`.

### Implementation for User Story 2

- [x] T025 [US2] Implement the debt table and migration in `src/db/schema/debts.ts`, `src/db/schema/index.ts`, and `drizzle/`; include the spec fields “tên người vay, loại vay, dư nợ tại ngày chốt, ngày đến hạn, trả gốc trong kỳ, trả lãi trong kỳ, số tiền phải trả mỗi kỳ, và kỳ cuối cùng.”
- [x] T026 [US2] Implement user-scoped debt create, list, update, and delete services in `src/features/debts/debt.repository.ts` and `src/features/debts/debt.service.ts`; validate exact non-negative amounts and date values without inventing unspecified reconciliation rules.
- [x] T027 [US2] Implement the Vietnamese debt list and create/edit forms in `app/(finance)/debts/page.tsx` and `src/features/debts/debt-form.tsx`, including total balance and period due amount display.
- [x] T028 [US2] Connect debt mutations to dashboard cache/revalidation in `src/features/debts/debt.actions.ts` so committed balance changes appear consistently in dashboard queries.
- [x] T029 [US2] Implement full on-time per-period debt payments with user-entered principal and interest, a linked transaction whose amount is their sum, and atomic debt-balance update in `src/db/schema/debt-payments.ts`, `src/features/debts/payment.service.ts`, and `app/(finance)/debts/[debtId]/payments/`.
- [X] T030 [US2] Allow deletion only after a debt is fully paid; retain immutable monthly snapshots and per-debt history after live-record deletion in `src/features/debts/debt.service.ts` and `tests/integration/debts/debt-delete.test.ts`.
- [x] T031 [P] [US2] Add atomicity and rollback tests for payment, linked transaction, and debt balance in `tests/integration/debts/debt-payment-atomicity.test.ts`, including the principal/interest sum invariant.

**Checkpoint**: Debt CRUD, due display, full per-period principal/interest entry, and settled-debt deletion all work with fake records while preserving closed monthly history.

---

## Phase 5: User Story 3 - Quản lý giao dịch, danh mục và mục tiêu tài chính (Priority: P1)

**Goal**: Manage categorized income/expense transactions, savings goals, and month-filtered financial history.

**Independent Test**: With fake records, create/edit/delete signed income and expense entries, verify category matching and “Khác” fallback, link transactions to a savings goal, and confirm over-target progress. Verify live transactions show only the current month and closed periods are available from immutable history.

### Tests for User Story 3

- [x] T032 [P] [US3] Add transaction CRUD, category matching, and time-filter integration tests using synthetic records in `tests/integration/transactions/transactions.test.ts`.
- [x] T033 [P] [US3] Add exact-amount and date validation tests for transactions in `tests/unit/transactions/transaction-validation.test.ts`.
- [x] T034 [P] [US3] Add savings-goal target and progress presentation tests with fake values in `tests/unit/goals/goal-display.test.ts`.

### Implementation for User Story 3

- [x] T035 [US3] Implement category create/list/delete services, income/expense-specific “Khác” categories, and the expense-only monthly-savings marker in `src/features/categories/category.repository.ts` and `src/features/categories/category.service.ts`.
- [x] T036 [US3] Implement transaction create/read/update/delete and current-month listing in `src/features/transactions/transaction.repository.ts` and `src/features/transactions/transaction.service.ts`; require a category matching kind, allow signed exact integer amounts, and use matching “Khác” when no specific category applies.
- [x] T037 [US3] Build Vietnamese current-month transaction list and create/edit forms in `app/(finance)/transactions/page.tsx` and `src/features/transactions/transaction-form.tsx`; accept signed decimal integer strings and keep past months in history rather than the live list.
- [x] T038 [US3] Build Vietnamese category management in the existing `app/(finance)/categories/page.tsx` and `app/(finance)/categories/category-manager.tsx`.
- [X] T039 [US3] Reject category deletion while any saved transaction references it and test the constraint in `src/features/categories/category.service.ts` and `tests/integration/categories/category-delete.test.ts`; preserve closed snapshot category labels.
- [x] T040 [US3] Add validation tests for signed corrections and strict category-kind matching, including fallback to the corresponding “Khác” category, in `src/features/transactions/transaction.service.ts` and `tests/unit/transactions/transaction-validation.test.ts`.
- [x] T041 [US3] Implement savings-goal target create/list/update and page in `src/db/schema/goals.ts`, `src/features/goals/goal.service.ts`, and `app/(finance)/goals/page.tsx`; use fabricated development fixtures and exact integer amounts.
- [x] T042 [US3] Derive goal progress from explicitly linked transactions, permit progress above target, and display non-negative remaining amount in `src/features/goals/goal.service.ts`, `app/(finance)/goals/goal-manager.tsx`, and `tests/unit/goals/goal-display.test.ts`.
- [X] T043 [US3] Implement the live current-month transaction list, immutable historical month navigation, and one-time pre-go-live backfill flow in `app/(finance)/transactions/page.tsx`, `app/(finance)/history/page.tsx`, `app/(finance)/history/backfill/page.tsx`, and `src/features/history/backfill.service.ts`; historical backfill must be finalized before snapshots are frozen.
- [X] T044 [US3] Implement idempotent automatic month-close snapshots and immutable cash-flow/debt detail in `src/db/schema/history.ts`, `src/features/history/history.service.ts`, and `app/(finance)/history/page.tsx`; include the one-time pre-go-live snapshot creation and each debt's closing balance after that month's recorded payment, with integration coverage in `tests/integration/history/month-close.test.ts`.

**Checkpoint**: Transaction/category CRUD, signed adjustments, goal-linked progress, current-month list, immutable close snapshots, and referenced-category deletion behavior are testable with fake data.

---

## Phase 6: User Story 4 - Lập kế hoạch dòng tiền và kiểm soát khả dụng trong tuần (Priority: P2)

**Goal**: Manage planned income/expenses and show dated events plus weekly available amounts based on confirmed recurrence and status rules.

**Independent Test**: With fake schedule data, verify recurring events appear only on dates that exist in the month and month boundaries use the system calendar. Verify weekly availability uses Monday-through-Sunday weeks, starts each month from entered cash, savings-deposit, and cash-equivalent balances, carries closing balances forward week to week, applies planned/actual flows and debt payments, and does not double-count a matched actual item. Test a calendar week crossing a month boundary.

### Tests for User Story 4

- [X] T045 [P] [US4] Add one-time cash-flow schedule CRUD tests with fake fixtures in `tests/integration/cash-flow/schedule.test.ts`.
- [X] T046 [P] [US4] Add tests that monthly recurrence skips nonexistent calendar dates and uses a month interval from system-calendar day one at 00:00 through the next month start in `tests/unit/cash-flow/recurrence.test.ts`.
- [X] T047 [P] [US4] Add tests for Monday-through-Sunday availability weeks, monthly opening asset balances, weekly closing-balance roll-forward, calendar weeks crossing month boundaries, planned/actual income and expenses plus full debt payments, and replacing matched planned items with actual values in `tests/unit/cash-flow/availability.test.ts`.

### Implementation for User Story 4

- [X] T048 [US4] Implement one-time scheduled cash-flow item schema, migration, and CRUD in `src/db/schema/cash-flow.ts` and `src/features/cash-flow/schedule.service.ts`; store exact amounts and user-calendar dates.
- [X] T049 [US4] Build Vietnamese cash-flow calendar and one-time event editor in `app/(finance)/cash-flow/page.tsx` and `src/features/cash-flow/schedule-form.tsx`, responsive on phone and desktop.
- [X] T050 [US4] Implement monthly recurrence using the system calendar; generate only dates that exist in the month, with the month interval from day one at 00:00 inclusive to next month day one at 00:00 exclusive, in `src/features/cash-flow/recurrence.ts` and `src/features/cash-flow/schedule.service.ts`.
- [X] T051 [US4] Implement Monday-through-Sunday availability using the entered cash, savings-deposit, and cash-equivalent balances at each month's start; apply planned/actual income and expenses and full debt payments by date, carry each week's closing balance forward within the month, and calculate weeks crossing month boundaries from each month's opening balances; replace matched planned items with actual transactions/payments in `src/features/cash-flow/availability.service.ts` and display results in `app/(finance)/cash-flow/page.tsx`.
- [X] T052 [US4] Implement recurring schedule editing, end dates, and matching a recorded actual transaction/payment to a scheduled occurrence in `app/(finance)/cash-flow/page.tsx` and `src/features/cash-flow/schedule.service.ts`.

**Checkpoint**: One-time and recurring schedules plus Monday-through-Sunday availability work with fabricated data, carry balances between weeks within each month, handle month boundaries, and do not double-count matched planned/actual flows.

---

## Phase 7: User Story 5 - Bảo mật, lưu trữ lâu dài và sao lưu dữ liệu (Priority: P1)

**Goal**: Protect access, persist records, provide operational recovery, and download the approved monthly Excel report.

**Independent Test**: Verify unauthenticated access is denied, the provisioned account can sign in, fake financial records survive app/database container recreation, a fabricated backup restores into a disposable database, and a closed month downloads as an Excel report with cash-flow and per-debt closing-balance details.

### Tests for User Story 5

- [X] T053 [P] [US5] Add Playwright tests for login, protected finance routes, and unavailable public sign-up in `tests/e2e/auth/auth.spec.ts`.
- [X] T054 [P] [US5] Add a disposable-database backup/restore integration test using only synthetic records in `tests/integration/operations/backup-restore.test.ts`.

### Implementation for User Story 5

- [X] T055 [US5] Add a production multi-stage standalone Next.js image in `Dockerfile` and `.dockerignore`; exclude local environment files, fixtures, and financial data from build context.
- [X] T056 [US5] Define an isolated application/database Compose project with named PostgreSQL volume, private network, health check, and no published database port in `compose.yaml`; use a unique Compose project name and do not join the trading bot's network.
- [X] T057 [US5] Document production environment variables, secrets handling, initial account provisioning, and reverse-proxy connection in `deploy/README.md` and `.env.example`; do not store live values in the repository.
- [X] T058 [US5] Add a PostgreSQL custom-format backup command and restore procedure in `scripts/backup/backup-postgres.sh`, `scripts/backup/restore-postgres.sh`, and `deploy/backup-restore.md`; target a disposable database for restore validation and do not overwrite production.
- [X] T059 [US5] Document off-host encrypted copy, backup retention, recovery objective, and restore rehearsal steps in `deploy/backup-restore.md`; leave schedule and retention values configurable for the operator rather than inventing policy.
- [x] T060 [US5] Add a monthly `.xlsx` report generated from the immutable selected-month snapshot in `src/features/export/monthly-report.ts`, `app/(finance)/history/[month]/export/route.ts`, and `tests/integration/export/monthly-report.test.ts`; include income/expense cash-flow details and each debt's closing balance after repayments, and do not implement workbook restore.
- [x] T061 [US5] Document development seed data, the one-time pre-go-live historical backfill and snapshot finalization, Docker Compose startup checks, and acceptance commands in `README.md` and `specs/001-personal-finance-manager/quickstart.md`; never include real account data.

**Checkpoint**: Compose topology is isolated, operational backup/restore works with synthetic data, and an authenticated user can download the specified monthly Excel report.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Verify the integrated stories, responsive behavior, consistency, and operational quickstart.

- [ ] T062 [P] Add desktop and phone viewport coverage for the authenticated finance navigation and core pages in `tests/e2e/responsive/finance-layout.spec.ts`.
- [ ] T063 Add cross-feature regression tests for transaction/debt changes reflected in dashboard and history in `tests/integration/finance/data-consistency.test.ts`; use fake seeded records.
- [ ] T064 Validate dashboard and common-task timing against SC-001 and SC-002 using a documented fabricated-data scenario in `tests/e2e/performance/finance-flows.spec.ts`.
- [ ] T065 Review application, migration, backup, and test configuration to ensure no credentials or real financial data are tracked; update `.gitignore`, `.env.example`, and `README.md` if needed.
- [ ] T066 Run the full documented local setup, lint, unit/integration/e2e suite, Compose smoke check, and disposable backup/restore rehearsal; record commands and outcomes in `specs/001-personal-finance-manager/quickstart.md`. Do not deploy to the VPS as part of this task.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; initialize the project first.
- **Foundational (Phase 2)**: Depends on Setup. Authenticated access, database connectivity, shared UI, and fake fixtures block finance stories.
- **User Story 1 (Phase 3)**: Depends on Foundational; all specified dashboard calculations can be implemented with synthetic fixtures.
- **User Story 2 (Phase 4)**: Depends on Foundational and the baseline finance schema from T016; full payment and settled-debt deletion rules are specified.
- **User Story 3 (Phase 5)**: Depends on Foundational and T016; category deletion rejects active references, and historical backfill must precede snapshot finalization.
- **User Story 4 (Phase 6)**: Depends on Foundational and transaction/debt data from T016, T025, and T036. Recurrence and weekly availability rules are specified.
- **User Story 5 (Phase 7)**: Auth foundations are in Phase 2. Compose, operational backup/restore, and the specified monthly Excel report can proceed.
- **Polish (Phase 8)**: Depends on all story tasks.

### User Story Dependencies

- **US1 (P1)**: Starts after Phase 2 and uses fake fixtures; end-to-end live-data validation additionally depends on US2 and US3.
- **US2 (P1)**: Starts after Phase 2 and T016; full per-period payments are defined and deletion is allowed after settlement while preserving snapshots.
- **US3 (P1)**: Starts after Phase 2 and T016; corrections, goal progress, snapshots, category deletion, and initial historical backfill behavior are specified.
- **US4 (P2)**: Starts after Phase 2; recurrence and weekly availability policies are specified.
- **US5 (P1)**: Auth foundations precede all stories. Operational backup and the monthly Excel report have no unresolved product decisions.

### Parallel Opportunities

- Setup T002–T005 can proceed in parallel with T001 where files do not overlap; coordinate T005 and T001 because both update `package.json`.
- Foundational T006–T013 can be parallelized by distinct files after project initialization, except T008/T009/T010 depend on database/auth setup and T011 depends on the shared app scaffold.
- Within US1, T014/T015 can be prepared in parallel; chart and summary-card UI (T019/T020) can proceed independently after the dashboard contract is stable.
- Within US2, T023/T024 can be written in parallel; debt UI and repository work can be split after schema T025.
- Within US3, transaction, category, and goal-target modules use separate files and can proceed in parallel after T016.
- Within US4, recurrence tests and implementation can proceed after T048; weekly availability tests and service implementation can proceed in parallel under the agreed formula.
- Within US5, Playwright auth tests and disposable backup tests can be prepared separately; Docker image, Compose, operational documentation, and Excel-report implementation touch distinct files.
- Cross-story parallelism is limited: US1 integration needs US2/US3 data, and US4 weekly availability consumes transaction/debt/schedule data.

## Parallel Example: User Story 3

```text
Task: T032 transaction CRUD and date-filter integration tests in tests/integration/transactions/transactions.test.ts
Task: T033 transaction validation tests in tests/unit/transactions/transaction-validation.test.ts
Task: T034 goal target/progress presentation tests in tests/unit/goals/goal-display.test.ts
```

These are separate synthetic-data test files and can be developed concurrently while the relevant module contracts remain stable.

## Implementation Strategy

### Suggested MVP

1. Complete Setup and Foundational phases.
2. Deliver the US1 dashboard using synthetic data and the confirmed net-worth and savings calculations.
3. Implement the US2 debt CRUD and US3 transaction/category CRUD needed to enter historical data.
4. Validate the integrated dashboard against those real app flows.
5. Complete all story tasks and validate cross-feature flows before calling the release feature-complete.

### Incremental Delivery

1. Setup + Foundational → working authenticated app skeleton and fake test data.
2. US1 baseline dashboard → test aggregates and distributions independently.
3. US2 and US3 → add debt/transaction/category workflows, then validate dashboard synchronization.
4. US4 → ship one-time and specified recurring planning, plus weekly availability.
5. US5 → validate Compose isolation, operational recovery, and monthly Excel reporting.
6. Polish → run all targeted/full validation. VPS deployment is a separate operator action and is not authorized by this task list.

## Open Product Decisions Blocking Tasks

None remain from the decisions answered so far. Reopen this section if new policy questions arise during implementation.

## Completion Notes

- Total tasks: **66**.
- Per user story: **US1: 9**, **US2: 9**, **US3: 13**, **US4: 8**, **US5: 9**.
- Setup: **5**; Foundational: **8**; Polish: **5**.
- Parallel opportunities are identified above; [P] appears only where separate files/tasks can be worked on without waiting for another incomplete task.
- Each story has an independent test criterion. Synthetic fixture usage is required throughout.
- Every task uses the required `- [ ] Tnnn` format; user-story tasks include `[USn]`, parallel tasks include `[P]`, and each description names implementation/test/documentation paths.
- MVP recommendation: Setup + Foundational, followed by US1 dashboard and US2/US3 data-entry flows. No current tasks are blocked by unresolved product decisions.
