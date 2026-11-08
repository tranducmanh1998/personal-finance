import Link from "next/link";
import { DistributionChart } from "@/features/dashboard/distribution-charts";
import { getDashboardSummary } from "@/features/dashboard/dashboard.repository";
import { SummaryCards } from "@/features/dashboard/summary-cards";
import { requireUserId } from "@/lib/dal";

type DashboardSearchParams = Promise<{
  month?: string | string[];
}>;

function localMonth(): string {
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

export default async function DashboardPage({
  searchParams,
}: Readonly<{ searchParams: DashboardSearchParams }>) {
  const params = await searchParams;
  const selected = Array.isArray(params.month) ? params.month[0] : params.month;
  const month = selected ?? localMonth();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return (
      <section>
        <h1>Tổng quan tài chính</h1>
        <p className="error-message" role="alert">
          Tháng báo cáo không hợp lệ.
        </p>
        <Link href="/dashboard">Quay về tháng hiện tại</Link>
      </section>
    );
  }

  const userId = await requireUserId();
  const summary = await getDashboardSummary(userId, month);

  return (
    <section>
      <header className="page-heading dashboard-heading">
        <div>
          <p className="eyebrow">Bức tranh tài chính</p>
          <h1>Tổng quan</h1>
          <p className="muted">
            Báo cáo {monthLabel(summary.month)} và so sánh với tháng trước.
          </p>
        </div>
        <form action="/dashboard" className="month-picker" method="get">
          <label htmlFor="dashboard-month">Chọn tháng</label>
          <div>
            <input
              defaultValue={summary.month}
              id="dashboard-month"
              name="month"
              type="month"
            />
            <button className="secondary-button" type="submit">
              Xem
            </button>
          </div>
        </form>
      </header>

      <SummaryCards summary={summary} />

      <section aria-labelledby="distribution-title" className="distribution-section">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Dòng tiền</p>
            <h2 id="distribution-title">Phân bổ theo danh mục</h2>
          </div>
          <Link className="text-link" href="/categories">
            Quản lý danh mục
          </Link>
        </div>
        <div className="distribution-grid">
          <DistributionChart
            categories={summary.currentMonth.incomeByCategory}
            title={`Thu nhập · ${monthLabel(summary.currentMonth.month)}`}
          />
          <DistributionChart
            categories={summary.currentMonth.expensesByCategory}
            title={`Chi tiêu · ${monthLabel(summary.currentMonth.month)}`}
          />
          <DistributionChart
            categories={summary.previousMonth.incomeByCategory}
            title={`Thu nhập · ${monthLabel(summary.previousMonth.month)}`}
          />
          <DistributionChart
            categories={summary.previousMonth.expensesByCategory}
            title={`Chi tiêu · ${monthLabel(summary.previousMonth.month)}`}
          />
        </div>
      </section>

      <section className="dashboard-next-steps">
        <div>
          <h2>Cập nhật tài sản</h2>
          <p className="muted">
            Số dư mới nhất được dùng để tính tài sản ròng.
          </p>
        </div>
        <Link className="secondary-button" href="/assets">
          Nhập số dư tài sản
        </Link>
      </section>
    </section>
  );
}
