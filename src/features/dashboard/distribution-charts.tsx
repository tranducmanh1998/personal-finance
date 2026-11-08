import type { CategorySummary } from "./dashboard.service";

const currency = new Intl.NumberFormat("vi-VN");
const palette = [
  "#1b806a",
  "#e69c32",
  "#4278bd",
  "#bd5a56",
  "#8064a2",
  "#46a6a0",
  "#c47a3c",
  "#778696",
];

type DistributionChartProps = Readonly<{
  title: string;
  categories: readonly CategorySummary[];
}>;

function formatVnd(amount: string): string {
  return `${currency.format(BigInt(amount))} ₫`;
}

function percentage(basisPointsValue: bigint): string {
  const basisPoints = Number(basisPointsValue);
  return `${Math.floor(basisPoints / 100)}.${String(basisPoints % 100).padStart(2, "0")}%`;
}

export function DistributionChart({
  title,
  categories,
}: DistributionChartProps) {
  const positiveCategories = categories.filter(
    (category) => BigInt(category.amount) > 0n,
  );
  const total = positiveCategories.reduce(
    (sum, category) => sum + BigInt(category.amount),
    0n,
  );

  const stops = positiveCategories.map((item, index) => {
    const amount = BigInt(item.amount);
    const start = positiveCategories
      .slice(0, index)
      .reduce((sum, category) => sum + BigInt(category.amount), 0n);
    const end =
      index === positiveCategories.length - 1
        ? 10_000n
        : ((start + amount) * 10_000n) / total;
    return `${palette[index % palette.length]} ${percentage(start)} ${percentage(end)}`;
  });
  const description =
    total > 0n
      ? `${title}; phần biểu đồ thể hiện tỷ trọng các danh mục có giá trị ròng dương. Danh mục điều chỉnh âm vẫn được liệt kê bên dưới.`
      : `${title}; chưa có khoản phát sinh dương trong tháng.`;

  return (
    <article className="distribution-card">
      <h3>{title}</h3>
      {total > 0n ? (
        <div
          aria-label={description}
          className="donut-chart"
          role="img"
          style={{
            background: `conic-gradient(${stops.join(", ")})`,
          }}
        >
          <span>{formatVnd(total.toString())}</span>
        </div>
      ) : (
        <div aria-label={description} className="donut-chart donut-chart--empty">
          <span>Chưa có dữ liệu</span>
        </div>
      )}
      {categories.length === 0 ? (
        <p className="empty-state">Chưa có giao dịch trong tháng này.</p>
      ) : (
        <ul className="distribution-list">
          {categories.map((item, index) => (
            <li key={item.categoryId}>
              <span
                aria-hidden="true"
                className="distribution-swatch"
                style={{
                  background:
                    BigInt(item.amount) > 0n
                      ? palette[index % palette.length]
                      : "#a8b2bf",
                }}
              />
              <span className="distribution-name">{item.categoryName}</span>
              <span className="distribution-amount">
                {formatVnd(item.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
