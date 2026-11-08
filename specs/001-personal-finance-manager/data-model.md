# Data Model: Personal Finance Manager

This is a relational design proposal for the entities and behaviors in `spec.md`. All records are private to the provisioned account. Use UUIDs for finance-domain identifiers and match foreign-key types to the authentication library's user identifier type. Store creation/update instants as `timestamptz`, and financial amounts as integer VND (`BIGINT`) without floating-point arithmetic. Use date-only types for user-calendar dates.

## Entities

### User and authentication

- **User**: Auth-library account identity; unique normalized login identifier, status, timestamps.
- **Session / Account / Verification**: Authentication-library-managed records required by the selected library. Never implement password hashing/session cryptography independently.
- **Relationships**: One user owns every financial record. Store `user_id` foreign keys even for the first single-user release so access checks and referential boundaries are explicit.
- **Validation**: No public account creation. The initial account is provisioned by a controlled operator-only procedure. Every data operation scopes by the authenticated user ID.

### User-entered asset balances

- **Asset types**: Cash, savings deposits, and cash equivalents only, per the user's clarification for FR-001.
- **Fields**: `id`, `user_id`, `kind` (`cash`, `savings_deposit`, `cash_equivalent`), `amount` (integer VND `BIGINT`), `as_of_date`, `created_at`, `updated_at`.
- **Relationships**: Each balance belongs to the provisioned user. Record one balance for each asset type per monthly close. Dashboard net worth subtracts total debt balance from the latest user-entered asset balances.
- **Validation**: Amounts are exact non-negative whole-đồng values. Initial balances are entered manually at go-live; in each later period, the user enters a fresh balance for each asset type and the application calculates the total.

### Category

- **Fields**: `id`, `user_id`, `name`, `kind` (`income` or `expense`), `is_monthly_savings` (boolean, permitted only for an expense category), `created_at`, `updated_at`.
- **Relationships**: One category may classify many transactions; a transaction uses exactly one category.
- **Validation**: Category kind must match the classified transaction kind. A matching “Khác” category is available for each kind. At most one expense category per user is marked as monthly savings. Monthly savings are expenses in that category; they contribute to expense totals and are displayed separately. Debt principal is not included in expenses or savings.
- **Deletion rule**: Reject category deletion while any saved transaction references it. Closed monthly snapshots preserve their captured category labels.

### Transaction

- **Fields**: `id`, `user_id`, `category_id` (required), `kind` (`income` or `expense`), `amount` (signed integer VND `BIGINT`), `occurred_on` (date), `description` (optional), `created_at`, `updated_at`.
- **Relationships**: Belongs to one user and one matching category; may have one linked debt payment and may link to savings goals through an association record.
- **Validation**: Amount precision is exact; negative amounts are permitted for corrections and affect totals with their sign. `kind` still defines the income/expense class and must match the category. Use the corresponding “Khác” category when no specific matching category exists. Dates are user calendar dates. The list view shows the current month; earlier periods are viewed through immutable month history.

### Debt

- **Fields**: `id`, `user_id`, `borrower_name` (spec wording), `loan_type`, `balance_as_of`, `balance_amount`, `due_date` (nullable if allowed), `principal_due_per_period`, `interest_due_per_period`, `payment_due_per_period`, `final_period` (nullable if unknown), `status`, `created_at`, `updated_at`.
- **Relationships**: One debt has many debt-payment records and dated balance/history records.
- **Validation**: Monetary fields use exact whole-đồng values. Dates and requiredness of individual fields must follow the final product rules; do not assume interest, principal, and total payment always reconcile without explicit policy.
- **State**: Active/closed state and resulting balance are updated atomically with the debt-payment operation. A settled debt may be deleted while closed monthly snapshots retain its details.

### Debt payment

- **Fields**: `id`, `user_id`, `debt_id`, `transaction_id`, `paid_on`, `principal_amount`, `interest_amount`, `created_at`.
- **Relationships**: Belongs to one debt; references the corresponding transaction; enforce a unique link if a transaction represents at most one debt payment.
- **Validation**: The user records each on-time, full period payment per debt by entering principal and interest paid. Both are exact non-negative integer amounts, and the linked payment transaction amount is their sum. Payment, transaction, and debt balance changes occur in one database transaction. Principal is tracked separately and is not classified as ordinary expense or monthly savings.
- **State/deletion**: A debt may be deleted after it is paid off. Preserve already closed monthly history and its debt details when deleting the live debt record.

### Cash-flow schedule item

- **Fields**: `id`, `user_id`, `kind` (`income` or `expense`), `label`, `amount`, `start_date`, optional `end_date`, recurrence definition, optional linked category or debt, active state, `created_at`, `updated_at`.
- **Relationships**: May generate dated planned occurrences; an occurrence may optionally link to the transaction that realizes it.
- **Validation**: Amounts are exact. Persist a recurrence definition, not an unbounded set of pre-generated dates.
- **Confirmed recurrence rules**: Monthly recurrence creates an occurrence only on a date that exists in that month. Month boundaries use the system calendar from 00:00 on day one inclusive to 00:00 on the next month's first day exclusive.
- **Weekly availability**: Weeks run Monday through Sunday. Start from the user's entered cash, savings-deposit, and cash-equivalent balances at the start of the month; apply planned/actual income and expenses and full debt payments (principal plus interest) by date, then carry each week's closing balance into the next week in that month. For a week crossing a month boundary, calculate each month's portion from that month's entered opening balances. When an actual transaction/payment matches a planned item, replace the planned amount with the actual amount to avoid double counting.

### Savings goal

- **Fields**: `id`, `user_id`, `name`, `target_amount`, optional `target_date`, status, `created_at`, `updated_at`.
- **Relationships**: Belongs to one user and links to the transactions the user selects as contributions through a goal-transaction association. Progress is derived from the signed amounts of linked contributions; the same transaction is not counted twice for the same goal.
- **Validation**: Target uses an exact non-negative whole-đồng amount. Progress is derived from linked transaction amounts and may exceed the target; remaining amount for display must not be negative.

### Monthly history

- **Fields**: `user_id`, period start/end, capture instant, immutable monthly income/expense transaction details and totals, asset balances used for net worth, and debt details with closing balances after that period's recorded repayments.
- **Relationships**: A period has immutable detail rows preserving transaction/category labels and debt name/type, payment details, and closing balances as of close. A unique `(user_id, month)` key makes retries idempotent. Snapshot detail rows do not depend on live transaction, category, debt, or payment rows; preserve deleted paid-off debt details.
- **Validation/state**: Close periods using the configured system calendar, from 00:00 on the first day inclusive to 00:00 on the next month's first day exclusive. Automatic catch-up runs idempotently on an authenticated application request after backfill has been confirmed; it never closes the current or a future month. A debt balance is known only when its dated balance anchor is no later than month end; subtract principal payments dated after the anchor through month end. If no valid anchor or result exists, save a null closing balance and mark it insufficient; do not infer from the current balance. Once closed, server-side mutations to the period are rejected. Current transaction list displays only the current month's records; prior periods are viewed from history.
- **Excel report**: A downloadable workbook for a selected closed month includes monthly income/expense cash-flow history and a detailed per-debt closing balance after repayments. This is a report, not a restore file.
- **Initial backfill**: Before go-live, enter pre-go-live transaction, asset, and debt history through a one-time backfill process. The user selects an ended-month range, reviews a preview, and explicitly confirms it; only that range is initially finalized, with no automatic expansion to earlier months. After confirmation, catch up sequentially through the most recently ended month. Do not lock existing account data before the user confirms.

## Consistency and deletion

- Apply foreign keys and user ownership constraints to all financial records.
- Use a single database transaction for mutations that affect multiple entities or summary inputs. A debt-payment change updates its linked transaction and debt state together.
- Derive dashboard and current-period totals from canonical records; create a frozen monthly snapshot at close for historical reports.
- Reject category deletion while any transaction references it; preserve closed history and settled debt snapshots independently of live-record deletion.
- Operational database backups are distinct from the user-facing monthly Excel report; an Excel restore workflow is not required.

## Decisions to confirm before affected implementation

No remaining product decisions are known from the answers so far.
