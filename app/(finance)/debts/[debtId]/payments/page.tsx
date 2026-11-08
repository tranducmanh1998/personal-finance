import Link from "next/link";
import { notFound } from "next/navigation";
import { DebtPaymentForm } from "../../debt-payment-form";
import { getDebt } from "@/features/debts/debt.service";
import { listDebtPayments } from "@/features/debts/payment.service";
import { requireUserId } from "@/lib/dal";

const currency = new Intl.NumberFormat("vi-VN");

function localDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

function formatVnd(amount: string): string {
  return `${currency.format(BigInt(amount))} ₫`;
}

export default async function DebtPaymentsPage({
  params,
}: Readonly<{ params: Promise<{ debtId: string }> }>) {
  const userId = await requireUserId();
  const { debtId } = await params;
  const [debt, payments] = await Promise.all([
    getDebt(userId, debtId),
    listDebtPayments(userId, debtId),
  ]);
  if (!debt) {
    notFound();
  }

  const today = localDate();

  return (
    <section>
      <header className="page-heading">
        <div>
          <Link className="back-link" href="/debts">
            ← Danh sách khoản nợ
          </Link>
          <p className="eyebrow">Thanh toán khoản nợ</p>
          <h1>{debt.borrowerName}</h1>
          <p className="muted">{debt.loanType}</p>
        </div>
      </header>

      <section className="content-card" aria-label="Dư nợ hiện tại">
        <p className="metric-label">Dư nợ hiện tại</p>
        <p className="metric-value">{formatVnd(debt.balanceAmount)}</p>
      </section>

      {BigInt(debt.balanceAmount) > 0n ? (
        <section className="content-card" aria-labelledby="record-payment-title">
          <h2 id="record-payment-title">Ghi nhận thanh toán</h2>
          <DebtPaymentForm
            currentPeriod={today.slice(0, 7)}
            debtId={debt.id}
            today={today}
          />
        </section>
      ) : (
        <p className="success-message">
          Khoản nợ đã tất toán; lịch sử thanh toán vẫn được lưu.
        </p>
      )}

      <section className="debt-section" aria-labelledby="payment-history-title">
        <div className="section-title-row">
          <h2 id="payment-history-title">Lịch sử thanh toán</h2>
          <span className="muted">{payments.length} kỳ</span>
        </div>
        {payments.length === 0 ? (
          <p className="empty-state">Chưa có thanh toán nào được ghi nhận.</p>
        ) : (
          <ul className="debt-list">
            {payments.map((payment) => (
              <li className="debt-card" key={payment.id}>
                <h3>Kỳ {payment.period}</h3>
                <dl className="debt-facts">
                  <div>
                    <dt>Ngày thanh toán</dt>
                    <dd>{payment.paidOn}</dd>
                  </div>
                  <div>
                    <dt>Tiền gốc</dt>
                    <dd>{formatVnd(payment.principalAmount)}</dd>
                  </div>
                  <div>
                    <dt>Tiền lãi</dt>
                    <dd>{formatVnd(payment.interestAmount)}</dd>
                  </div>
                  <div>
                    <dt>Tổng thanh toán</dt>
                    <dd>{formatVnd(payment.totalAmount)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
