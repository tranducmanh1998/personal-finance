# personal-finance

Ứng dụng quản lý tài chính cá nhân của ManhTD

## Chạy bản khung trong GitHub Codespaces

Ứng dụng hiện có khung đăng nhập và trang tổng quan được bảo vệ. Các tính năng tài chính sẽ được thực hiện theo từng giai đoạn trong `specs/001-personal-finance-manager/tasks.md`. Không dùng dữ liệu tài chính thật trong môi trường phát triển.

### Cài đặt môi trường local

Mở terminal Codespaces tại thư mục gốc repository, rồi chạy:

```bash
npm ci
```

Trên Codespace mới, tạo thông tin PostgreSQL và Better Auth riêng. Chỉ chạy phần khởi tạo này một lần; nếu `.env` hoặc container đã tồn tại, đừng tạo mật khẩu mới vì nó sẽ không khớp database cũ. Tệp `.env` được Git bỏ qua:

```bash
umask 077
DB_PASSWORD="$(openssl rand -hex 32)"
AUTH_SECRET="$(openssl rand -base64 48)"
printf 'DATABASE_URL=postgresql://finance_dev:%s@localhost:5432/personal_finance\nBETTER_AUTH_SECRET=%s\nBETTER_AUTH_URL=http://localhost:3000\n' \
  "$DB_PASSWORD" "$AUTH_SECRET" > .env
if [ -n "${CODESPACE_NAME:-}" ] && [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]; then
  AUTH_URL="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
else
  AUTH_URL="http://localhost:3000"
fi
sed -i "s|^BETTER_AUTH_URL=.*|BETTER_AUTH_URL=${AUTH_URL}|" .env

docker run --name personal-finance-postgres --detach \
  --restart unless-stopped \
  --publish 5432:5432 \
  --env POSTGRES_USER=finance_dev \
  --env "POSTGRES_PASSWORD=$DB_PASSWORD" \
  --env POSTGRES_DB=personal_finance \
  postgres:17-alpine
unset DB_PASSWORD AUTH_SECRET
```

Nếu container đã tồn tại nhưng đang dừng, chạy `docker start personal-finance-postgres`. Không xóa container hay volume hiện có.

Migration đăng nhập đã được lưu trong repository. Áp dụng migration và tạo tài khoản đầu tiên:

```bash
npm run db:migrate
npm run provision-user
```

Lệnh provisioning hỏi email/tên hiển thị và yêu cầu nhập mật khẩu hai lần; mật khẩu không hiển thị trong terminal. Tài khoản ban đầu chỉ tạo được khi database chưa có người dùng nào. Không truyền mật khẩu qua tham số dòng lệnh, không lưu mật khẩu vào fixture, và không commit `.env`.

Khởi động ứng dụng:

```bash
npm run dev
```

Mở tab **Ports** trong Codespaces, chọn cổng `3000` (mở bằng trình duyệt nếu chưa tự mở), rồi đăng nhập bằng tài khoản vừa tạo. `/dashboard` hiện là trang khung, chưa có số liệu tài chính.

### Kiểm tra nền tảng

```bash
npm run typecheck
npm run lint
npm test
```

Các fixture trong `tests/fixtures/` là dữ liệu giả định, được nạp qua helper chỉ cho phép chạy trong môi trường test. Không dùng tài khoản, dữ liệu tài chính, hay thông tin từ VPS.

Để chạy integration test với PostgreSQL, cấu hình `TEST_DATABASE_URL` trỏ đến database dùng riêng cho kiểm thử; tên database bắt buộc kết thúc bằng `_test` và phải khác database trong `DATABASE_URL`. Chạy qua lệnh:

```bash
npm run test:integration
```

Lệnh sẽ dừng nếu thiếu một trong hai URL hoặc cấu hình không đảm bảo cách ly. Integration test không dùng `DATABASE_URL` làm URL kết nối thay thế; script xác minh trước khi tạo database kiểm thử, còn setup của Vitest xác minh trước khi nạp các test có kết nối hoặc migration.

Để chạy smoke test trình duyệt, cài Chromium và thư viện hệ thống một lần bằng `npx playwright install --with-deps chromium`, sau đó chạy `npm run test:e2e`. Không lưu bản sao database, backup, hoặc dữ liệu tài chính thật trong repository.


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
