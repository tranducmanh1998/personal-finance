# Application Contract

This is a private browser application, not a public third-party API. The browser uses authenticated Next.js pages and server-side actions/route handlers; financial domain operations are validated and authorized on the server. No endpoint may accept a user-supplied owner ID as authorization.

## Browser routes

| Route | Access | Contract |
|---|---|---|
| `/login` | Public | Sign in to the provisioned account. No registration route or public sign-up operation. |
| `/dashboard` | Authenticated | Current financial summary and previous-month totals/distributions. |
| `/transactions` | Authenticated | Add, edit, delete, and review current-month income/expense transactions; use matching categories, including “Khác” per transaction kind when no specific category applies. |
| `/debts` | Authenticated | Add, edit, delete, review balances/due amounts, and record a linked debt payment. |
| `/cash-flow` | Authenticated | Review and manage scheduled income/expense and weekly availability. |
| `/goals` | Authenticated | Create and review savings targets/progress. |
| `/assets` | Authenticated | Enter initial and monthly balances for cash, savings deposits, and cash equivalents. |
| `/history` | Authenticated | Review immutable monthly snapshots and download the selected month's Excel report. |
| `/history/backfill` | Authenticated | Enter pre-go-live records, preview an ended-month range, and explicitly confirm its finalization. |

All finance pages redirect unauthenticated users to `/login`. Authorization is repeated at the server data-access boundary; a route-level redirect alone is not sufficient.

## Mutation contract

- Accept typed values and validate them server-side, including ownership, required matching category kind, date, signed exact amount, and related-record consistency.
- Return either a successful result or a structured field/domain error. Invalid or unauthorized requests must not partially persist changes.
- Amounts cross JSON boundaries as decimal integer strings; never use JSON floating-point values for financial arithmetic.
- A debt-payment mutation records the user-entered principal and interest for that debt-period; linked transaction amount equals their sum. Update payment, transaction, and debt balance atomically.
- A transaction may be negative for a correction. Its kind must still match its category; use a matching “Khác” category rather than an invalid category.
- Transactions in the category marked as monthly savings are included in expenses and displayed separately. Debt principal is separate from expense and savings totals.
- A goal's progress is derived from transactions explicitly linked to it and may exceed its target.
- Weekly availability uses Monday-through-Sunday weeks. Start from the user's entered cash, savings-deposit, and cash-equivalent balances at the start of the month; apply planned/actual income and expenses and full debt payments by date, then carry each week's closing balance forward within that month. For a week crossing a month boundary, calculate each month's portion from that month's entered opening balances. A matched actual transaction/payment replaces its planned item to prevent double counting.
- Recurring schedules may have an inclusive end date; monthly dates that do not exist are skipped. Match only a recorded transaction of the same kind or an expense debt payment on the scheduled date. A planned occurrence never creates an actual transaction or payment.
- Opening balances are the three asset kinds entered on the first day of each calendar month. If any kind is missing, show the calculated forecast as incomplete and provide a link to enter the opening balance.
- At month close, save an immutable snapshot of monthly cash flow, category labels, asset balances, debt/payment details, and per-debt closing balances after recorded payments. Snapshot details do not cascade from live financial records. Deleting a paid-off live debt must not delete closed snapshots.
- A debt closing balance is available only when its dated balance anchor is no later than the selected month end; subtract principal payments after the anchor through month end. Otherwise store an unknown balance and mark the monthly total incomplete; never infer a past balance from the current balance.
- Pre-go-live history is entered through a one-time backfill flow: the user selects an ended-month range, reviews transaction and unresolved-debt counts, and explicitly confirms. Do not lock months before confirmation or extend backward before the selected start. After confirmation, authenticated requests catch up ended months sequentially and idempotently; never close the current or a future month.
- Once a month is closed, server-side mutations affecting its transactions, assets, debts, or payments are rejected.
- Reject category deletion while any saved transaction references it.
- User-facing errors are safe and localized in Vietnamese; sensitive internals are not sent to the browser.

## Authentication and operational interfaces

- Authentication endpoints are provided by the selected maintained auth library and are private to the app. Registration/sign-up is disabled server-side.
- No unauthenticated financial-data API exists.
- Operational backup/restore is an administrator procedure, not an app route.
- Authenticated users can download a monthly Excel workbook containing the selected month's income/expense history and detailed debt closing balances after payments. Excel is a report, not a restore file.

## UI contract

- Interface text is Vietnamese and layouts support desktop and phone widths.
- Display VND with locale-appropriate formatting, while retaining integer exactness in storage and calculations.
- Financial summaries, current-month transaction list, debt payment, schedule, goal, and history views must reflect committed canonical data; closed monthly history is immutable. Errors must be visible and must not resemble success.
