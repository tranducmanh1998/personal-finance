import Link from "next/link";
import { getMonthlyHistory } from "@/features/history/history.service";
import { previousMonth } from "@/features/dashboard/dashboard.service";
import { requireUserId } from "@/lib/dal";

type HistorySearchParams = Promise<{ month?: string | string[] }>;

const currency = new Intl.NumberFormat("vi-VN");

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("vi-VN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function formatAmount(amount: string): string {
  return `${currency.format(BigInt(amount))} ₫`;
}

export default async function HistoryPage({
  searchParams,
}: Readonly<{ searchParams: HistorySearchParams }>) {
  const params = await searchParams;
  const selected = Array.isArray(params.month) ? params.month[0] : params.month;
  const month = selected ?? previousMonth(currentMonth());

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return (
      <section>
        <h1>Lịch sử theo tháng</h1>
        <p className="error-message" role="alert">
          Tháng cần xem không hợp lệ.
        </p>
        <Link href="/history">Quay về lịch sử tháng gần nhất</Link>
      </section>
    );
  }

  const userId = await requireUserId();
  const history = await getMonthlyHistory(userId, month);
  const closed = history.state === "closed";

  return (
    <section>
      {closed && (
        <a className="secondary-button" href={`/history/${history.month}/export`}>
          Tải báo cáo Excel
        </a>
      )}
      <header className="page-heading history-heading">
        <div>
          <p className="eyebrow">Dữ liệu theo kỳ</p>
          <h1>Lịch sử {monthLabel(history.month)}</h1>
          <p className="muted">
            {closed
              ? `Đã chốt lúc ${history.closedAt?.toLocaleString("vi-VN")}.`
              : history.state === "current"
                ? "Tháng hiện tại chưa được chốt."
                : "Tháng này chưa được chốt; dữ liệu đang xem chưa bất biến."}
          </p>
        </div>
        <form action="/history" className="month-picker" method="get">
          <label htmlFor="history-month">Chọn tháng</label>
          <div>
            <input
              defaultValue={history.month}
              id="history-month"
              name="month"
              type="month"
            />
            <button className="secondary-button" type="submit">
              Xem
            </button>
          </div>
        </form>
      </header>

      {closed && history.summary ? (
        <div
          className="history-summary-grid"
          aria-label="Tổng kết tháng đã chốt"
        >
          <article className="metric-card metric-card--income">
            <p className="metric-label">Thu nhập</p>
            <p className="metric-value">
              {formatAmount(history.summary.incomeTotal)}
            </p>
          </article>
          <article className="metric-card metric-card--expense">
            <p className="metric-label">Chi tiêu (không gồm gốc nợ)</p>
            <p className="metric-value">
              {formatAmount(history.summary.expenseTotal)}
            </p>
          </article>
          <article className="metric-card metric-card--savings">
            <p className="metric-label">
              {history.summary.unresolvedDebtCount > 0
                ? "Tổng dư nợ đã xác định — chưa đầy đủ"
                : "Tổng dư nợ đã xác định"}
            </p>
            <p className="metric-value">
              {formatAmount(history.summary.knownDebtTotal)}
            </p>
          </article>
        </div>
      ) : (
        <aside className="history-notice" role="status">
          <strong>
            {history.state === "current"
              ? "Chưa có snapshot tháng."
              : "Tháng chưa được chốt."}
          </strong>{" "}
          Dữ liệu đang xem lấy từ hồ sơ hiện có và có thể thay đổi. Không dùng
          dư nợ hiện tại để thay cho dư nợ cuối tháng.
        </aside>
      )}

      <section
        className="history-section"
        aria-labelledby="history-transactions"
      >
        <div className="section-title-row">
          <h2>Giao dịch thu chi</h2>
          <span className="muted">{history.transactions.length} khoản</span>
        </div>
        {history.transactions.length === 0 ? (
          <p className="empty-state">Chưa có giao dịch trong tháng này.</p>
        ) : (
          <div className="history-list">
            {history.transactions.map((transaction) => (
              <article
                className="history-card"
                key={transaction.sourceTransactionId}
              >
                <div>
                  <p className="history-card-title">
                    {transaction.description || transaction.categoryName}
                  </p>
                  <p className="muted">
                    {transaction.occurredOn} ·{" "}
                    {transaction.kind === "income" ? "Thu nhập" : "Chi tiêu"} ·{" "}
                    {transaction.categoryName}
                    {transaction.isDebtPayment
                      ? " · Giao dịch liên kết trả nợ"
                      : ""}
                  </p>
                </div>
                <strong>{formatAmount(transaction.amount)}</strong>
              </article>
            ))}
          </div>
        )}
      </section>

      {closed ? (
        <>
          <section className="history-section" aria-labelledby="history-debts">
            <div className="section-title-row">
              <h2 id="history-debts">Dư nợ cuối tháng theo khoản</h2>
            </div>
            {history.debtBalances.length === 0 ? (
              <p className="empty-state">Không có khoản nợ được ghi nhận.</p>
            ) : (
              <div className="history-list">
                {history.debtBalances.map((record) => (
                  <article className="history-card" key={record.sourceDebtId}>
                    <div>
                      <p className="history-card-title">
                        {record.borrowerName}
                      </p>
                      <p className="muted">
                        {record.loanType} · Mốc dư nợ {record.balanceAsOf}
                      </p>
                      {record.balanceStatus === "insufficient_history" ? (
                        <p className="error-message">
                          Chưa đủ dữ liệu lịch sử để xác định dư nợ tháng này.
                        </p>
                      ) : null}
                    </div>
                    <strong>
                      {record.closingBalance === null
                        ? "Chưa xác định"
                        : formatAmount(record.closingBalance)}
                    </strong>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section
            className="history-section"
            aria-labelledby="history-payments"
          >
            <div className="section-title-row">
              <h2 id="history-payments">Thanh toán nợ trong tháng</h2>
              <span className="muted">{history.debtPayments.length} khoản</span>
            </div>
            {history.debtPayments.length === 0 ? (
              <p className="empty-state">
                Không có thanh toán nợ được ghi nhận trong tháng này.
              </p>
            ) : (
              <div className="history-list">
                {history.debtPayments.map((payment) => (
                  <article className="history-card" key={payment.id}>
                    <div>
                      <p className="history-card-title">
                        {payment.borrowerName}
                      </p>
                      <p className="muted">
                        {payment.loanType} · Kỳ {payment.period} ·{" "}
                        {payment.paidOn}
                      </p>
                      <p className="muted">
                        Gốc {formatAmount(payment.principalAmount)} · Lãi{" "}
                        {formatAmount(payment.interestAmount)}
                      </p>
                    </div>
                    <strong>{formatAmount(payment.totalAmount)}</strong>
                  </article>
                ))}
              </div>
            )}
          </section>
          {history.assets.length > 0 ? (
            <section
              className="history-section"
              aria-labelledby="history-assets"
            >
              <div className="section-title-row">
                <h2 id="history-assets">Số dư tài sản gần nhất trong kỳ</h2>
              </div>
              <div className="history-list">
                {history.assets.map((asset) => (
                  <article className="history-card" key={asset.kind}>
                    <div>
                      <p className="history-card-title">
                        {asset.kind === "cash"
                          ? "Tiền mặt"
                          : asset.kind === "savings_deposit"
                            ? "Tiền gửi tiết kiệm"
                            : "Vật tương đương tiền"}
                      </p>
                      <p className="muted">Số dư tại ngày {asset.asOfDate}</p>
                    </div>
                    <strong>{formatAmount(asset.amount)}</strong>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      <section className="history-backfill-link">
        <div>
          <h2>Nhập hoặc chốt lịch sử trước go-live</h2>
          <p className="muted">
            Chỉ chốt sau khi đã xem trước dữ liệu và chọn khoảng tháng.
          </p>
        </div>
        <Link className="secondary-button" href="/history/backfill">
          Quản lý nhập lịch sử
        </Link>
      </section>
    </section>
  );
}
