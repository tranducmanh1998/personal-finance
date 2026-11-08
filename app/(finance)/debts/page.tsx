import { DebtForm } from "./debt-form";
import { DebtList } from "./debt-list";
import { listDebts } from "@/features/debts/debt.service";
import { requireUserId } from "@/lib/dal";

const currency = new Intl.NumberFormat("vi-VN");

function localDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

function formatVnd(amount: bigint): string {
  return `${currency.format(amount)} ₫`;
}

export default async function DebtsPage() {
  const userId = await requireUserId();
  const debts = await listDebts(userId);
  const totalBalance = debts.reduce(
    (total, debt) => total + BigInt(debt.balanceAmount),
    0n,
  );
  const totalDuePerPeriod = debts.reduce(
    (total, debt) => total + BigInt(debt.paymentDuePerPeriod),
    0n,
  );
  const today = localDate();

  return (
    <section>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Khoản nợ</p>
          <h1>Quản lý khoản nợ</h1>
          <p className="muted">
            Theo dõi dư nợ, ngày đến hạn và số tiền dự kiến phải trả mỗi kỳ.
          </p>
        </div>
      </header>

      <div className="debt-summary-grid" aria-label="Tổng quan khoản nợ">
        <article className="metric-card metric-card--expense">
          <p className="metric-label">Tổng dư nợ</p>
          <p className="metric-value">{formatVnd(totalBalance)}</p>
        </article>
        <article className="metric-card metric-card--savings">
          <p className="metric-label">Tổng phải trả mỗi kỳ</p>
          <p className="metric-value">{formatVnd(totalDuePerPeriod)}</p>
        </article>
      </div>

      <section className="content-card" aria-labelledby="create-debt-title">
        <h2 id="create-debt-title">Thêm khoản nợ</h2>
        <DebtForm today={today} />
      </section>

      <section
        aria-labelledby="debt-list-title"
        className="debt-section"
      >
        <div className="section-title-row">
          <h2 id="debt-list-title">Danh sách khoản nợ</h2>
          <span className="muted">{debts.length} khoản</span>
        </div>
        <DebtList debts={debts} today={today} />
      </section>
    </section>
  );
}
