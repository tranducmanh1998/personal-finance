import { listUserCategories } from "@/features/categories/category.repository";
import { ensureOtherCategories } from "@/features/categories/category.repository";
import { listCurrentMonthTransactions } from "@/features/transactions/transaction.service";
import { requireUserId } from "@/lib/dal";
import { TransactionList } from "./transaction-list";
import { TransactionForm } from "./transaction-form";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function currentDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

export default async function TransactionsPage() {
  const userId = await requireUserId();
  await ensureOtherCategories(userId);
  const [categories, transactions] = await Promise.all([
    listUserCategories(userId),
    listCurrentMonthTransactions(userId),
  ]);
  const categoryNames = new Map(categories.map((item) => [item.id, item.name]));
  const month = currentMonth();

  return (
    <section>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Thu chi</p>
          <h1>Giao dịch tháng {month}</h1>
          <p className="muted">
            Danh sách chỉ gồm giao dịch trong tháng hiện tại. Các khoản điều
            chỉnh có thể nhập số tiền âm.
          </p>
        </div>
      </header>

      <section
        className="content-card"
        aria-labelledby="create-transaction-title"
      >
        <h2 id="create-transaction-title">Thêm giao dịch</h2>
        <TransactionForm categories={categories} today={currentDate()} />
      </section>

      <section
        aria-labelledby="transaction-list-title"
        className="transaction-section"
      >
        <div className="section-title-row">
          <h2 id="transaction-list-title">Giao dịch tháng này</h2>
          <span className="muted">{transactions.length} giao dịch</span>
        </div>
        <TransactionList
          categories={categories}
          categoryNames={categoryNames}
          transactions={transactions}
          today={currentDate()}
        />
      </section>
    </section>
  );
}
