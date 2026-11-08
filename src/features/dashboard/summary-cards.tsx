import type { DashboardSummary } from "./dashboard.service";

const currency = new Intl.NumberFormat("vi-VN");

function formatVnd(amount: string): string {
  return `${currency.format(BigInt(amount))} ₫`;
}

function comparison(current: string, previous: string): string {
  const difference = BigInt(current) - BigInt(previous);
  if (difference === 0n) return "Không đổi so với tháng trước";
  const direction = difference > 0n ? "Tăng" : "Giảm";
  return `${direction} ${formatVnd(difference.toString())} so với tháng trước`;
}

const metrics = [
  {
    key: "netWorth",
    label: "Tài sản ròng",
    tone: "metric-card--net-worth",
    getValue: (summary: DashboardSummary) => summary.netWorth,
  },
  {
    key: "income",
    label: "Thu nhập",
    tone: "metric-card--income",
    getValue: (summary: DashboardSummary) => summary.currentMonth.income,
    previousValue: (summary: DashboardSummary) => summary.previousMonth.income,
  },
  {
    key: "expenses",
    label: "Chi tiêu",
    tone: "metric-card--expense",
    getValue: (summary: DashboardSummary) => summary.currentMonth.expenses,
    previousValue: (summary: DashboardSummary) => summary.previousMonth.expenses,
  },
  {
    key: "savings",
    label: "Tiết kiệm tháng này",
    tone: "metric-card--savings",
    getValue: (summary: DashboardSummary) =>
      summary.currentMonth.monthlySavings,
    previousValue: (summary: DashboardSummary) =>
      summary.previousMonth.monthlySavings,
  },
] as const;

export function SummaryCards({
  summary,
}: Readonly<{ summary: DashboardSummary }>) {
  return (
    <div className="summary-grid">
      {metrics.map((metric) => {
        const value = metric.getValue(summary);
        const previous =
          "previousValue" in metric
            ? metric.previousValue(summary)
            : undefined;
        return (
          <article
            className={`metric-card ${metric.tone}`}
            key={metric.key}
          >
            <p className="metric-label">{metric.label}</p>
            <p className="metric-value">{formatVnd(value)}</p>
            {previous !== undefined ? (
              <p className="metric-comparison">
                {comparison(value, previous)}
              </p>
            ) : (
              <p className="metric-comparison">Theo số dư và dư nợ mới nhất</p>
            )}
          </article>
        );
      })}
    </div>
  );
}
