# Feature Specification: Personal Finance Manager

**Feature Branch**: `[001-personal-finance-manager]`

**Created**: 2026-11-05

**Status**: Draft

**Input**: User description: "Xây dựng ứng dụng web quản lý tài chính cá nhân, dùng tốt trên máy tính và điện thoại. Chức năng: ..."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Theo dõi tình hình tài chính cá nhân (Priority: P1)

Người dùng muốn xem nhanh tình hình tài chính hiện tại và trong tháng để biết tài sản ròng, thu nhập, chi tiêu, tiết kiệm, cũng như cách chi tiêu và nguồn thu được phân bổ theo danh mục.

**Why this priority**: Đây là trung tâm của sản phẩm: người dùng cần hiểu rõ trạng thái tài chính trước khi đưa ra quyết định về chi tiêu, trả nợ, hoặc lập kế hoạch.

**Independent Test**: Có thể kiểm tra bằng cách nhập dữ liệu thu chi và nợ ban đầu rồi xem các chỉ số tổng quan, phân bổ chi tiêu và thu nhập ở các module liên quan.

**Acceptance Scenarios**:

1. **Given** người dùng đã nhập dữ liệu thu chi và nợ cho tháng hiện tại, **When** họ mở tổng quan, **Then** hệ thống hiển thị tài sản ròng, thu nhập tháng, chi tiêu tháng, tiết kiệm tháng và các xu hướng liên quan.
2. **Given** người dùng có nhiều giao dịch thu và chi theo danh mục, **When** họ xem báo cáo, **Then** hệ thống hiển thị tổng thu/chi tháng trước, biểu đồ tròn phân bổ chi theo danh mục và biểu đồ tròn phân bổ thu theo nguồn.

---

### User Story 2 - Quản lý khoản nợ và thanh toán định kỳ (Priority: P1)

Người dùng muốn theo dõi tất cả khoản vay, biết dư nợ, ngày đến hạn, số tiền phải trả mỗi kỳ và tác động của khoản thanh toán đến tình hình tài chính tổng thể.

**Why this priority**: Nợ là thành phần tài chính có ảnh hưởng lớn đến dòng tiền và khả năng tiết kiệm, nên cần được quản lý rõ ràng và liên kết với các giao dịch.

**Independent Test**: Có thể kiểm tra bằng cách thêm khoản vay, ghi nhận thanh toán gốc và lãi, sau đó xác nhận trạng thái dư nợ, số tiền cần đóng theo tháng và các chỉ số tổng quan cập nhật.

**Acceptance Scenarios**:

1. **Given** người dùng đã thêm khoản vay với thông tin tên người vay, loại vay, ngày đến hạn, dư nợ và số tiền phải trả mỗi kỳ, **When** họ xem danh sách nợ, **Then** hệ thống hiển thị tổng dư nợ và các khoản cần đóng theo tháng.
2. **Given** người dùng thanh toán khoản nợ bằng giao dịch trả nợ, **When** giao dịch được lưu, **Then** hệ thống trừ phần gốc trả trong kỳ khỏi khoản nợ và cập nhật số liệu liên quan trong các module liên quan.
3. **Given** người dùng chỉnh sửa hoặc xoá khoản vay, **When** thay đổi được lưu, **Then** hệ thống cập nhật lại tổng dư nợ và lịch trình thanh toán tương ứng.

---

### User Story 3 - Quản lý giao dịch, danh mục và mục tiêu tài chính (Priority: P1)

Người dùng muốn ghi nhận giao dịch thu chi, phân loại chúng, theo dõi dòng tiền theo thời gian và thiết lập mục tiêu tiết kiệm.

**Why this priority**: Đây là cơ chế cốt lõi để dữ liệu tài chính được ghi nhận, phân tích và sử dụng cho lịch trình, báo cáo và mục tiêu.

**Independent Test**: Có thể kiểm tra bằng cách tạo danh mục thu/chi, ghi thêm giao dịch và thiết lập mục tiêu tiết kiệm, sau đó xác nhận dữ liệu hiển thị trên tổng quan, lịch sử và kế hoạch.

**Acceptance Scenarios**:

1. **Given** người dùng có danh mục thu nhập và chi tiêu, **When** họ tạo hoặc cập nhật giao dịch, **Then** hệ thống lưu giao dịch với định danh thời gian, loại, danh mục và số tiền phù hợp.
2. **Given** người dùng đã thiết lập mục tiêu tiết kiệm, **When** họ xem kế hoạch hoặc dashboard, **Then** hệ thống hiển thị tiến độ hiện tại so với mục tiêu và số tiền còn thiếu để đạt mục tiêu.
3. **Given** người dùng muốn xem lịch sử theo tháng, **When** họ chọn thời gian, **Then** hệ thống hiển thị dòng tiền thu chi và dư nợ lịch sử phù hợp với thời điểm đã chọn.

---

### User Story 4 - Lập kế hoạch dòng tiền và kiểm soát khả dụng trong tuần (Priority: P2)

Người dùng cần thiết kế dòng tiền trong tháng, biết ngày nào cần chi, ngày nào có thu cố định và số tiền khả dụng trong từng tuần để chủ động quản lý tiền mặt.

**Why this priority**: Kế hoạch dòng tiền giúp người dùng tránh hụt tiền, dễ dàng trả nợ và lập ngân sách theo thời gian.

**Independent Test**: Có thể kiểm tra bằng cách nhập các mốc thu/chi trong tháng, sau đó xác nhận số tiền khả dụng theo tuần và các ngày cần thanh toán.

**Acceptance Scenarios**:

1. **Given** người dùng đã thiết lập các mốc thu/chi định kỳ trong tháng, **When** họ mở kế hoạch, **Then** hệ thống hiển thị lịch dòng tiền, các khoản cần chi và các khoản thu cố định theo ngày.
2. **Given** người dùng có các giao dịch và lịch thanh toán chưa hoàn tất, **When** họ xem khả dụng trong tuần, **Then** hệ thống cập nhật số tiền khả dụng dựa trên các khoản đến hạn và dự báo thu chi.
3. **Given** người dùng chỉnh sửa lịch thu/chi lặp, **When** họ đặt ngày kết thúc, **Then** lịch chỉ sinh các khoản đến hết ngày đó và khoản dự kiến không tự tạo giao dịch thực tế.
4. **Given** một giao dịch hoặc khoản thanh toán nợ đã ghi nhận cùng ngày với khoản dự kiến, **When** người dùng khớp chúng, **Then** dự báo thay khoản dự kiến bằng số tiền thực tế đúng một lần.

---

### User Story 5 - Bảo mật, lưu trữ lâu dài và báo cáo dữ liệu (Priority: P1)

Người dùng muốn dữ liệu tài chính được bảo vệ bằng đăng nhập, lưu trữ lâu dài, có thể xem lịch sử đã chốt và tải báo cáo Excel theo tháng.

**Why this priority**: Dữ liệu tài chính là thông tin nhạy cảm và phải được bảo mật, đồng thời phải còn tồn tại trong thời gian dài mà không mất dữ liệu.

**Independent Test**: Có thể kiểm tra bằng cách đăng nhập bằng tài khoản được ủy quyền, lưu giao dịch giả, chốt tháng, kiểm tra lịch sử không đổi và tải báo cáo Excel tháng.

**Acceptance Scenarios**:

1. **Given** người dùng chưa đăng nhập, **When** họ truy cập ứng dụng, **Then** hệ thống yêu cầu xác thực để truy cập dữ liệu tài chính.
2. **Given** người dùng có lịch sử tháng đã chốt, **When** họ tải báo cáo tháng, **Then** hệ thống tạo tệp Excel có lịch sử thu/chi và dư nợ cuối tháng chi tiết từng khoản sau thanh toán.

### Edge Cases

- Không cho xoá danh mục đang được giao dịch sử dụng; giao dịch phải được chuyển sang danh mục khác trước.
- Khả dụng tuần tính theo tuần Thứ Hai đến hết Chủ Nhật. Số dư tiền mặt, tiền gửi tiết kiệm và vật tương đương tiền đầu tháng là số dư mở đầu; cộng/trừ dòng tiền theo ngày và chuyển số dư cuối tuần sang tuần kế tiếp trong tháng. Khoản thực tế khớp kế hoạch thay thế khoản dự kiến.
- Nếu ngày lặp không tồn tại trong một tháng, lịch chỉ tạo sự kiện vào các ngày tồn tại; không tự chuyển sang ngày khác.
- Lịch lặp có ngày kết thúc tùy chọn, tính cả ngày kết thúc; chỉ có thể khớp một giao dịch cùng ngày và cùng loại, còn thanh toán nợ chỉ khớp lịch chi.
- Giao dịch âm được tính có dấu trong tổng thu/chi; danh mục vẫn phải khớp loại giao dịch.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Hệ thống PHẢI cung cấp một tổng quan tài chính hiện tại bao gồm tài sản ròng, thu nhập tháng này, chi tiêu tháng này và tiết kiệm tháng này.
- **Clarification for FR-001**: Tài sản ròng = tiền mặt + tiền gửi tiết kiệm + vật tương đương tiền - tổng dư nợ. Người dùng nhập số dư ban đầu và nhập lại số dư từng loại tài sản mỗi kỳ. Tiết kiệm tháng là khoản tiền người dùng đưa mẹ, được ghi nhận là chi tiêu nhưng hiển thị riêng; khoản trả nợ gốc không được tính là tiết kiệm hoặc chi tiêu này.
- **FR-002**: Hệ thống PHẢI hiển thị tổng thu và tổng chi của tháng trước, cùng với biểu đồ phân bổ chi theo danh mục và biểu đồ phân bổ thu theo nguồn.
- **FR-003**: Hệ thống PHẢI cho phép người dùng quản lý khoản nợ với các trường: tên người vay, loại vay, dư nợ tại ngày chốt, ngày đến hạn, trả gốc trong kỳ, trả lãi trong kỳ, số tiền phải trả mỗi kỳ, và kỳ cuối cùng.
- **FR-004**: Hệ thống PHẢI hiển thị tổng số tiền dư nợ và số tiền phải đóng theo từng tháng cho mỗi khoản nợ.
- **FR-005**: Hệ thống PHẢI hỗ trợ thêm, chỉnh sửa và xoá khoản nợ.
- **FR-006**: Hệ thống PHẢI cho phép người dùng quản lý giao dịch thu/chi theo tháng với bộ lọc theo thời gian.
- **Clarification for FR-006**: Danh sách giao dịch mặc định chỉ hiển thị giao dịch của tháng hiện tại. Các tháng đã chốt được xem trong lịch sử tháng, không phải danh sách giao dịch hiện tại.
- **FR-007**: Hệ thống PHẢI cho phép phân loại từng giao dịch theo mục đích chi và nguồn thu nhập.
- **FR-008**: Hệ thống PHẢI hỗ trợ thêm, chỉnh sửa và xoá giao dịch.
- **FR-009**: Hệ thống PHẢI cho phép người dùng thiết kế dòng tiền trong tháng với các mốc thu và chi, ngày cần thanh toán và sự kiện thu cố định.
- **FR-010**: Hệ thống PHẢI hiển thị số tiền khả dụng trong từng tuần dựa trên kế hoạch dòng tiền và trạng thái thực tế.
- **FR-011**: Hệ thống PHẢI cho phép người dùng tạo mục tiêu tiết kiệm và theo dõi tiến độ hiện tại so với mục tiêu đã đặt.
- **FR-012**: Hệ thống PHẢI quản lý danh mục nguồn thu nhập và danh mục chi, bao gồm thêm mới và xoá danh mục.
- **FR-013**: Hệ thống PHẢI hiển thị lịch sử dư nợ và lịch sử dòng tiền theo tháng cho các khoảng thời gian đã lưu.
- **Clarification for FR-013**: Khi hết tháng, hệ thống lưu dữ liệu chốt tháng thành lịch sử không chỉnh sửa. Lịch sử dư nợ thể hiện chi tiết từng khoản sau khi ghi nhận thanh toán kỳ đó. Nếu chưa có mốc dư nợ không muộn hơn ngày cuối tháng, dư nợ khoản đó là chưa đủ dữ liệu; không suy ngược từ số dư hiện tại. Chốt tháng tự động chạy bù lặp an toàn khi có request ứng dụng đã xác thực sau khi backfill được xác nhận; không chốt tháng hiện tại hoặc tương lai.
- **FR-014**: Hệ thống PHẢI yêu cầu đăng nhập để truy cập dữ liệu tài chính và bảo vệ thông tin người dùng.
- **FR-015**: Hệ thống PHẢI lưu dữ liệu tài chính lâu dài và cho phép tải báo cáo Excel theo tháng gồm lịch sử dòng tiền thu/chi và dư nợ chốt tháng chi tiết từng khoản sau khi thanh toán. Không yêu cầu khôi phục dữ liệu từ tệp Excel; sao lưu vận hành cơ sở dữ liệu được thực hiện theo hướng dẫn triển khai.
- **FR-016**: Khi người dùng thanh toán nợ bằng một giao dịch trả nợ riêng, hệ thống PHẢI cập nhật phần gốc trả trong kỳ của khoản nợ tương ứng và cập nhật các chỉ số liên quan trong các module liên quan.
- **Clarification for FR-016**: Người dùng thanh toán đầy đủ đúng hạn theo từng kỳ và tự nhập số tiền gốc, lãi đã trả cho từng khoản nợ. Tổng thanh toán kỳ là tổng gốc và lãi; trả gốc được theo dõi riêng, không tính là chi tiêu hoặc tiết kiệm tháng.
- **FR-017**: Hệ thống PHẢI giữ cho các số liệu liên quan đồng bộ giữa giao dịch, nợ, tổng quan, lịch sử và kế hoạch khi dữ liệu thay đổi.
- **FR-018**: Hệ thống PHẢI hỗ trợ trải nghiệm sử dụng trên máy tính và điện thoại với bố cục và tương tác tối ưu cho các màn hình khác nhau.
- **FR-019**: Hệ thống PHẢI hỗ trợ nhập dữ liệu ban đầu tại thời điểm go-live và cho phép người dùng cập nhật dần các khoản thu chi và nợ đã có trước đó.
- **Clarification for FR-019**: Dữ liệu trước ngày go-live được nhập qua một quy trình backfill ban đầu. Người dùng chọn khoảng tháng đã kết thúc, xem trước rồi xác nhận rõ; chỉ khoảng đã chọn được chốt ban đầu, không tự mở rộng về các tháng trước đó. Sau xác nhận, hệ thống chốt bù tuần tự đến hết tháng đã kết thúc gần nhất và không cho sửa các tháng đã chốt.
- **Clarification for FR-009**: Lịch lặp theo ngày chỉ tạo sự kiện vào ngày hợp lệ tồn tại trong tháng; không dịch ngày sang ngày khác nếu ngày lặp không tồn tại. Ranh giới tháng theo ngày hệ thống: từ 00:00 ngày đầu tháng đến trước 00:00 ngày đầu tháng kế tiếp.
- **Clarification for FR-010**: Tuần chạy từ thứ Hai đến hết Chủ Nhật. Số dư tiền mặt, tiền gửi tiết kiệm và vật tương đương tiền người dùng nhập đầu tháng là số dư mở đầu; hệ thống cộng thu nhập và trừ chi tiêu cùng các khoản thanh toán nợ (gồm gốc và lãi) theo ngày, rồi chuyển số dư cuối tuần sang tuần tiếp theo trong tháng. Trong tuần giao với ranh giới tháng, chỉ tính các dòng tiền thuộc tháng tương ứng từ ngày đầu tháng. Khi giao dịch/thanh toán thực tế khớp với khoản đã lên kế hoạch, số thực tế thay thế khoản dự kiến để không tính trùng. Người dùng nhập các khoản thu/chi dự kiến và thanh toán thực tế trên ứng dụng.
- **Clarification for FR-011**: Người dùng liên kết giao dịch đóng góp tương ứng với mục tiêu; tiến độ là tổng các giao dịch được liên kết và có thể vượt mục tiêu.

### Additional Confirmed Business Rules

- Giao dịch âm và giao dịch điều chỉnh được phép. Loại giao dịch vẫn phải khớp với loại danh mục; khi không có danh mục phù hợp, dùng danh mục “Khác” tương ứng loại thu hoặc chi.
- Khoản nợ được phép xoá sau khi đã tất toán; lịch sử tháng đã chốt vẫn được giữ lại.
- Không cho xoá danh mục đang được bất kỳ giao dịch đã lưu nào sử dụng.
- Giao dịch của tháng hiện tại có thể được tạo, sửa, xoá trong tháng đó. Lịch sử tháng sau khi chốt là bất biến.

### Key Entities *(include if feature involves data)*

- **Người dùng**: Chủ sở hữu dữ liệu tài chính; có thông tin đăng nhập và quyền truy cập dữ liệu cá nhân.
- **Tài sản**: Số liệu tiền mặt, tiền gửi tiết kiệm và vật tương đương tiền do người dùng nhập để tính tài sản ròng.
- **Giao dịch**: Một khoản thu hoặc chi với số tiền, thời gian, danh mục, mô tả, và loại giao dịch.
- **Khoản nợ**: Một khoản vay hoặc nợ với người vay, loại nợ, ngày đến hạn, số tiền gốc, lãi, lịch trả và trạng thái hiện tại.
- **Danh mục**: Nhóm phân loại cho thu nhập hoặc chi tiêu, chủ yếu bao gồm nguồn thu và mục đích chi.
- **Kế hoạch dòng tiền**: Các mốc thu/chi định kỳ trong tháng, ngày thanh toán và dự báo khả dụng theo tuần.
- **Mục tiêu tiết kiệm**: Mục tiêu tài chính mong muốn với giá trị cần tiết kiệm và tiến độ hiện tại.
- **Lịch sử tài chính**: Định kỳ hoặc theo tháng lưu trữ dữ liệu quá khứ về nợ, thu chi và dòng tiền để theo dõi xu hướng.
- **Số dư tài sản**: Số dư theo ngày chốt của tiền mặt, tiền gửi tiết kiệm và vật tương đương tiền do người dùng nhập.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Người dùng có thể xem tổng quan tài chính hiện tại và các chỉ số hàng tháng trong vòng dưới 1 phút sau khi cập nhật dữ liệu mới.
- **SC-002**: Người dùng có thể hoàn thành các tác vụ chính như thêm giao dịch, cập nhật khoản nợ và xem báo cáo trong thời gian dưới 3 phút cho một chu kỳ thông thường.
- **SC-003**: 90% người dùng hoàn thành quy trình xem tổng quan, quản lý giao dịch và theo dõi khoản nợ mà không cần hỗ trợ bổ sung.
- **SC-004**: Hệ thống hiển thị thông tin tương ứng giữa giao dịch, khoản nợ, kế hoạch và mục tiêu với độ chính xác dữ liệu đạt mức chấp nhận trong kiểm thử nghiệp vụ.
- **SC-005**: Người dùng có thể truy cập dữ liệu cá nhân từ máy tính và điện thoại với trải nghiệm rõ ràng và không mất thông tin quan trọng.
- **SC-006**: Không có dữ liệu tài chính quan trọng nào bị mất trong quá trình nhập, chỉnh sửa, xuất dữ liệu hoặc sao lưu theo quy trình do hệ thống hỗ trợ.

## Assumptions

- Người dùng của giải pháp là cá nhân hoặc hộ gia đình duy nhất, không phải hệ thống nhiều người dùng đồng thời trong phiên bản đầu.
- Dữ liệu hiện có tại thời điểm go-live sẽ được nhập thủ công từ người dùng hoặc từ dữ liệu đã có trước đó.
- Mặc định, dữ liệu tài chính được lưu trữ dài hạn với quyền truy cập giới hạn cho tài khoản người dùng đã xác thực.
- Báo cáo Excel tháng là để xem/lưu báo cáo, không dùng để khôi phục dữ liệu. Sao lưu vận hành PostgreSQL được mô tả trong hướng dẫn triển khai.
- Có thể tồn tại các loại nợ khác ngoài mô tả ban đầu (ví dụ tín dụng, vay cá nhân, thẻ), nhưng mẫu dữ liệu cơ bản phải hỗ trợ các loại đã nêu.
- Dòng tiền khả dụng trong tuần là tổng hợp ước tính từ thu nhập, chi tiêu, nợ và lịch thanh toán đã lưu, và không bắt buộc phải là dự báo chính xác tới từng đồng.
- Các quy tắc danh mục và khả dụng theo tuần được xác định trong phần làm rõ FR-010 và Additional Confirmed Business Rules.
