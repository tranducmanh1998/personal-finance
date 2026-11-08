# Sao lưu và diễn tập khôi phục PostgreSQL

Các bước này dành cho người vận hành trên host chạy Compose. Chúng không tự
động chạy lịch backup, mã hóa, tải bản sao đi nơi khác, hay triển khai ứng dụng.
Không dùng database, volume, mạng hoặc credentials của bot giao dịch.

## Tạo backup

Yêu cầu: Docker Compose đang chạy dịch vụ `database` khỏe mạnh và file
`.env.compose` riêng tư đã được cấu hình. Tạo thư mục ngoài repository, chỉ
operator được đọc:

```bash
umask 077
mkdir -p "$HOME/backups"
chmod 700 "$HOME/backups"
ENV_FILE="$PWD/.env.compose" \
  scripts/backup/backup-postgres.sh "$HOME/backups/personal-finance-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Script tạo PostgreSQL custom-format dump qua `pg_dump`, kiểm tra dump bằng
`pg_restore --list`, và từ chối ghi trong repository hoặc ghi đè một file đã
tồn tại. File mới được tạo với quyền chỉ chủ sở hữu đọc/ghi. Giữ log vận hành
nhưng không ghi URL kết nối, mật khẩu, hay dữ liệu tài chính vào log.

## Diễn tập restore vào database dùng một lần

Chọn một tên database mới kết thúc `_test`, khác database ứng dụng và chưa tồn
tại. Restore script xác minh custom-format dump, từ chối tên không an toàn,
database ứng dụng hoặc database đích đã tồn tại; script chỉ tạo database mới,
không xóa/ghi đè đích. Khi chạy script trên chính host đích, đặt
`COMPOSE_PROJECT_NAME` và `ENV_FILE` đúng với project/file của database nguồn:

```bash
ENV_FILE="$PWD/.env.compose" \
  scripts/backup/restore-postgres.sh \
  "$HOME/backups/personal-finance-20261107T030000Z.dump" \
  finance_restore_20261107_test
```

Kết nối trực tiếp vào database khôi phục bằng role operator và kiểm tra ít nhất:

- Database và các migration mong đợi có mặt.
- Bảng, constraint, index và schema cần thiết được khôi phục.
- Các bảng tổng hợp và số lượng bản ghi phù hợp với thời điểm backup.
- Dữ liệu tổng hợp giả lập, các tổng tài chính, tài khoản nợ và lịch sử đã chốt
  phù hợp với bản backup (nếu có).

Sau khi xác minh, operator có thể xóa **chỉ database `_test` vừa tạo** bằng quy
trình quản trị đã kiểm tra. Không dùng lệnh xóa tự động hoặc nhắm vào database
ứng dụng. Nếu restore lỗi, script giữ database đích để operator điều tra; không
tự xóa trạng thái lỗi.

## Mã hóa, bản sao ngoài host và retention

PostgreSQL custom-format dump không được mã hóa bởi các script này. Trước khi
đưa backup ra khỏi host, dùng kho lưu trữ mã hóa được tổ chức phê duyệt; bảo vệ
khóa mã hóa tách khỏi bản backup. Chỉ truyền qua kênh xác thực/mã hóa, hạn chế
quyền đọc, và kiểm tra checksum sau khi tải lên/tải xuống. Không commit file,
checksum nhạy cảm, khóa, hay bản backup vào Git.

Operator phải cấu hình và ghi nhận riêng:

- Lịch chạy và nơi lưu backup.
- Retention tại host và ngoài host, bao gồm cách xóa an toàn bản hết hạn.
- Recovery Point Objective (RPO) và Recovery Time Objective (RTO).
- Người/role có quyền tạo, mã hóa, tải, khôi phục và xóa backup.
- Giám sát tuổi backup, dung lượng, checksum, lỗi upload và kết quả diễn tập.

Không ấn định lịch, thời hạn lưu, RPO/RTO hoặc nhà cung cấp ở đây; cần chủ sở
hữu dịch vụ phê duyệt dựa trên yêu cầu vận hành. Diễn tập restore vào database
dùng một lần định kỳ và sau thay đổi lớn về PostgreSQL, schema hoặc quy trình
backup. Tài liệu này chỉ mô tả quy trình; không thực hiện kết nối hoặc thao tác
trên VPS.
