import ExcelJS from "exceljs";
import { loadMonthlySnapshotDetails } from "@/features/history/history.repository";

export async function createMonthlyReport(userId: string, month: string) {
  const data = await loadMonthlySnapshotDetails(userId, month);
  if (!data) return null;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Quản lý tài chính cá nhân";
  function sheet(name: string, headers: string[], rows: (string | number)[][]) {
    const page = workbook.addWorksheet(name);
    page.addRow(headers);
    page.addRows(rows);
    page.getRow(1).font = { bold: true };
    page.views = [{ state: "frozen", ySplit: 1 }];
    page.columns.forEach((column) => { column.width = 28; });
    page.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  }
  const snapshot = data.snapshot;
  sheet("Tổng hợp", ["Chỉ tiêu", "Giá trị"], [
    ["Tháng", month], ["Chốt lúc", snapshot.closedAt.toISOString()],
    ["Thu nhập (đ)", snapshot.incomeTotal.toString()],
    ["Chi tiêu (đ)", snapshot.expenseTotal.toString()],
    ["Tổng dư nợ đã xác định (đ)", snapshot.knownDebtTotal.toString()],
    ["Khoản nợ thiếu lịch sử", snapshot.unresolvedDebtCount],
    ["Định dạng tiền", "Số nguyên đồng lưu dạng văn bản để giữ nguyên độ chính xác"],
    ["Chi tiết dòng tiền", "Giao dịch trả nợ xuất hiện trong Thu chi và được phân tách trong Thanh toán nợ"],
    ["Chi tiêu tổng hợp", "Theo snapshot đã chốt, loại trừ gốc trả nợ"],
  ]);
  sheet("Thu chi", ["Ngày", "Loại", "Danh mục", "Số tiền (đ)", "Mô tả", "Trả nợ"],
    data.transactions.map((row) => [row.occurredOn, row.kind === "income" ? "Thu nhập" : "Chi tiêu", row.categoryName, row.amount.toString(), row.description ?? "", row.isDebtPayment ? "Có" : "Không"]));
  sheet("Dư nợ cuối tháng", ["Người vay", "Loại vay", "Mốc dư nợ", "Dư nợ sau thanh toán (đ)", "Trạng thái"],
    data.debts.map((row) => [row.borrowerName, row.loanType, row.balanceAsOf, row.closingBalance?.toString() ?? "", row.balanceStatus === "complete" ? "Đủ dữ liệu" : "Thiếu lịch sử"]));
  sheet("Thanh toán nợ", ["Người vay", "Loại vay", "Kỳ", "Ngày trả", "Gốc (đ)", "Lãi (đ)", "Tổng trả (đ)"],
    data.payments.map((row) => [row.borrowerName, row.loanType, row.period, row.paidOn, row.principalAmount.toString(), row.interestAmount.toString(), (row.principalAmount + row.interestAmount).toString()]));
  sheet("Tài sản", ["Loại", "Ngày số dư", "Số tiền (đ)"],
    data.assets.map((row) => [row.kind, row.asOfDate, row.amount.toString()]));
  return workbook.xlsx.writeBuffer();
}
