# Quickstart and Validation Guide

This guide describes the planned developer and operator validation flow. It does not define implementation commands or configuration that do not yet exist; command names should be reconciled with the eventual package scripts and deployment topology.

## Prerequisites

- GitHub Codespace or a Linux development environment with the pinned Node.js LTS, package manager, and Docker Compose.
- A local PostgreSQL instance from the development Compose configuration.
- Development-only environment values stored outside Git (for example, in an ignored local environment file). Never use real financial data or production credentials in tests.
- A provisioned test account; public registration must remain disabled.

## Development and checks

1. Install the dependencies using the repository's lockfile.
2. Create the local development environment from the documented example, with a unique local database and auth secret.
3. Start PostgreSQL and wait for its health check.
4. Apply checked-in database migrations, then provision a development-only account using the controlled seed/provision procedure.
5. Start the Next.js development server and sign in.
6. Run the project's unit, PostgreSQL integration, and Playwright end-to-end scripts.

Expected outcomes:

- Unauthenticated requests to finance pages/data are rejected or redirected to login; sign-up is unavailable.
- Signed transaction amounts round-trip exactly; category kind must match and “Khác” exists for both kinds.
- A full per-period debt payment records principal and interest whose sum matches the linked payment transaction; the update either commits all related data or changes none.
- Net worth equals cash + savings deposits + cash equivalents - total debt. Monthly savings expenses are included in expenses, shown separately, and exclude debt principal.
- After historical backfill is explicitly confirmed, authenticated requests idempotently close ended months (never the current/future month). Snapshots preserve cash flow, category labels, asset balances, debt/payment details, and known closing balances; a missing dated debt anchor remains visibly unknown rather than being inferred from the current balance.
- The live transaction list shows only the current month; a selected closed month downloads as an Excel report with cash-flow details and per-debt closing balances after repayment.
- Weekly availability uses Monday-through-Sunday weeks, starts each month from the entered cash, savings-deposit, and cash-equivalent balances, and carries each week's closing balance into the next week; matching actuals replace scheduled flows rather than being counted twice.
- Deleting a category referenced by any saved transaction is rejected. A settled debt may be deleted without removing its closed snapshot.
- The layout and primary flows remain usable at desktop and phone viewport sizes.
- Invalid inputs and persistence failures surface an error rather than a success-shaped response.

## Production deployment validation

1. On the VPS, configure a distinct Compose project name and project-specific environment/secrets outside Git.
2. Confirm the finance app has its own Compose network and persistent PostgreSQL volume; do not join the trading bot's network or use host networking.
3. Start the database and app through Compose. Confirm database health precedes app readiness.
4. Confirm only the web entry point is reachable through the VPS reverse proxy, PostgreSQL has no published host port, and HTTPS is terminated by the configured proxy.
5. Verify the initial account can sign in and that an unauthenticated client cannot read financial data.

## Backup and restore rehearsal

1. Produce a PostgreSQL custom-format dump using the documented operational procedure.
2. Encrypt and copy the dump to the configured off-host backup destination.
3. Restore it to a disposable database using `pg_restore`, without overwriting production.
4. Validate schema/migrations, authentication records, representative transaction totals, debt balances, and history against the source backup.
5. Record backup age, retention result, and elapsed restore time; revisit the operator's recovery objectives if the rehearsal misses them.

The backup schedule, retention, recovery objective, and encryption/key-handling procedure must be configured by the operator. Operational database backup does not determine the required user-facing export format.

## Initial historical backfill

Before go-live, enter pre-go-live transactions, asset balances, and debt information through the one-time backfill flow. Select an ended-month range, review the preview (including unresolved debt anchors), and explicitly confirm; months before the selected range are not added automatically. After confirmation, ended months catch up sequentially on authenticated requests. Closed snapshots are immutable and the live transaction list remains scoped to the current month.


## Nghiệm thu và báo cáo tháng

Dùng tài khoản và dữ liệu tổng hợp riêng khi phát triển. Dữ liệu giả có thể được tạo qua giao diện hoặc fixture kiểm thử hiện có. Lệnh `npm run provision-user` hỏi thông tin tài khoản tương tác. Dùng URL Codespaces cổng 3000 đã cấu hình trong môi trường local để đăng nhập.

Lịch sử trước vận hành được nhập ở `/history/backfill`. Chọn khoảng tháng đã kết thúc, xem trước giao dịch, tài sản và dư nợ thiếu mốc, rồi xác nhận hoàn tất. Thao tác xác nhận chốt và khóa các tháng trong khoảng đã chọn. Sau đó yêu cầu có xác thực sẽ chốt bù các tháng đã kết thúc theo cơ chế hiện có. Chuẩn bị backup đã kiểm tra trước khi xác nhận dữ liệu cần giữ lâu dài.

Ở `/history`, chọn tháng đã chốt rồi bấm **Tải báo cáo Excel**. Workbook có các sheet Tổng hợp, Thu chi, Dư nợ cuối tháng, Thanh toán nợ và Tài sản. Số tiền lưu dạng văn bản nguyên đồng để giữ chính xác, kể cả giá trị lớn. Dư nợ thiếu mốc để trống và có nhãn Thiếu lịch sử. Báo cáo dùng snapshot của tài khoản đang đăng nhập.

Các lệnh nghiệm thu trong Codespaces:

```bash
npm run lint
npm run typecheck
npm test
POSTGRES_TOOLS_CONTAINER=personal-finance-postgres npm run test:integration
npm run test:e2e
```

Integration yêu cầu `TEST_DATABASE_URL` riêng có hậu tố `_test` qua guard hiện có. Playwright cần Chromium cài theo hướng dẫn thiết lập của repository.

Khởi động Compose theo `deploy/README.md` với file môi trường riêng và Compose project đã chọn. Chạy `docker compose --env-file <env-file> -p <project> config --quiet`, rồi theo thứ tự khởi động database, migrations và app được ghi trong tài liệu triển khai. Kiểm tra `docker compose --env-file <env-file> -p <project> ps`, healthcheck PostgreSQL và HTTP `/login` qua cổng web được cấu hình. Quy trình sao lưu và khôi phục thử nằm ở `deploy/backup-restore.md`.
