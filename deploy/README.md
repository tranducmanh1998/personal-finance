# Chuẩn bị triển khai ứng dụng tài chính

Tài liệu này chuẩn bị cấu hình Docker Compose để người vận hành xem xét. Nó
không triển khai hoặc kết nối tới VPS. Không dùng chung Compose project, mạng,
volume, database, tài khoản hay secrets với bot giao dịch.

## Biến môi trường và secrets

1. Tạo `.env.compose` từ `.env.example`; tệp này đã được Git bỏ qua:

   ```bash
   umask 077
   cp .env.example .env.compose
   ```

2. Đặt `FINANCE_DB_NAME` thành `personal_finance`, `FINANCE_DB_USER` thành tài
   khoản riêng của ứng dụng, và thay `FINANCE_DB_PASSWORD` bằng mật khẩu ngẫu
   nhiên riêng. Template chỉ chứa placeholder.
3. Tạo `BETTER_AUTH_SECRET` riêng dài ít nhất 32 ký tự; không dùng secret của
   môi trường phát triển khác.
4. Đặt `BETTER_AUTH_URL` thành origin HTTPS công khai mà reverse proxy sử dụng.
   Không thêm đường dẫn trang vào URL này.
5. Đặt `APP_PORT` thành cổng loopback trên host; mặc định là `3000`.

Có thể tạo giá trị ngẫu nhiên bằng:

```bash
umask 077
openssl rand -hex 32
openssl rand -base64 48
```

Các lệnh trên in giá trị ra terminal; chỉ chạy trong terminal riêng tư. Chép
giá trị trực tiếp vào `.env.compose` bằng trình soạn thảo an toàn. Không đưa
secrets vào Git, image arguments, logs, hoặc lệnh shell có thể lưu history.

## Schema và tài khoản ban đầu

Trước khi chạy ứng dụng lần đầu trên một database trống, áp dụng các migration
đã kiểm duyệt trong repository:

```bash
docker compose --env-file .env.compose --profile operations run --rm migrate
```

Lệnh trên chỉ chạy dịch vụ một lần trong mạng riêng của Compose; app không tự
áp migration khi khởi động. Chỉ provision tài khoản đầu tiên bằng quy trình
operator đã được kiểm duyệt. Không bật đăng ký công khai hoặc thêm dữ liệu tài
chính mẫu vào database.

Lệnh provisioning có thể chạy tương tác trong terminal operator:

```bash
docker compose --env-file .env.compose --profile operations run --rm migrate npm run provision-user
```

Email và tên được nhập tương tác; mật khẩu được nhập không hiển thị. Quy trình
chỉ tạo tài khoản đầu tiên và từ chối khi database đã có user.

## Ứng dụng và reverse proxy

Sau khi schema và tài khoản đã sẵn sàng:

```bash
docker compose --env-file .env.compose up --build --detach
docker compose --env-file .env.compose ps
```

PostgreSQL chỉ ở trong mạng riêng, không publish cổng host. Ứng dụng được bind
vào `127.0.0.1:${APP_PORT}`; cấu hình reverse proxy đang có trên VPS kết nối tới
`http://127.0.0.1:${APP_PORT}` và kết thúc TLS. Không mở cổng PostgreSQL ra
Internet và không nối Compose project này vào mạng của bot giao dịch.

Trước khi cân nhắc triển khai thật, người vận hành cần xác minh riêng backup và
restore, migration, TLS, đăng nhập, readiness, firewall, secrets và đường proxy
trên môi trường được phê duyệt. Các bước đó chưa được thực hiện trên VPS.
