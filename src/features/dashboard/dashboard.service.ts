export type DashboardTransaction = Readonly<{
  categoryId: string;
  categoryName: string;
  kind: "income" | "expense";
  amount: string;
  occurredOn: string;
  isMonthlySavings: boolean;
}>;

export type DashboardInput = Readonly<{
  month: string;
  transactions: readonly DashboardTransaction[];
  assets: readonly Readonly<{ kind: string; amount: string }>[];
  debts: readonly Readonly<{ balanceAmount: string }>[];
}>;

export type CategorySummary = Readonly<{
  categoryId: string;
  categoryName: string;
  amount: string;
}>;

export type PeriodSummary = Readonly<{
  month: string;
  income: string;
  expenses: string;
  monthlySavings: string;
  incomeByCategory: readonly CategorySummary[];
  expensesByCategory: readonly CategorySummary[];
}>;

export type DashboardSummary = Readonly<{
  month: string;
  netWorth: string;
  currentMonth: PeriodSummary;
  previousMonth: PeriodSummary;
}>;

function parseMonth(month: string): { year: number; monthIndex: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    throw new Error("Month must use the YYYY-MM format.");
  }

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) {
    throw new Error("Month must be a valid calendar month.");
  }

  return { year, monthIndex: monthNumber - 1 };
}

function integer(value: string): bigint {
  if (!/^-?\d+$/.test(value)) {
    throw new Error("Financial amounts must be decimal integers.");
  }
  return BigInt(value);
}

function sum(values: readonly string[]): bigint {
  return values.reduce((total, value) => total + integer(value), 0n);
}

function groupByCategory(
  transactions: readonly DashboardTransaction[],
  kind: "income" | "expense",
): CategorySummary[] {
  const grouped = new Map<string, { categoryName: string; amount: bigint }>();
  for (const transaction of transactions) {
    if (transaction.kind !== kind) continue;

    const category = grouped.get(transaction.categoryId) ?? {
      categoryName: transaction.categoryName,
      amount: 0n,
    };
    category.amount += integer(transaction.amount);
    grouped.set(transaction.categoryId, category);
  }

  return [...grouped.entries()]
    .map(([categoryId, category]) => ({
      categoryId,
      categoryName: category.categoryName,
      amount: category.amount.toString(),
    }))
    .sort((left, right) => left.categoryName.localeCompare(right.categoryName));
}

function summarizePeriod(
  transactions: readonly DashboardTransaction[],
  month: string,
): PeriodSummary {
  const periodTransactions = transactions.filter(
    (transaction) => transaction.occurredOn.slice(0, 7) === month,
  );
  const income = periodTransactions.filter((item) => item.kind === "income");
  const expenses = periodTransactions.filter((item) => item.kind === "expense");

  return {
    month,
    income: sum(income.map((item) => item.amount)).toString(),
    expenses: sum(expenses.map((item) => item.amount)).toString(),
    monthlySavings: sum(
      expenses
        .filter((item) => item.isMonthlySavings)
        .map((item) => item.amount),
    ).toString(),
    incomeByCategory: groupByCategory(periodTransactions, "income"),
    expensesByCategory: groupByCategory(periodTransactions, "expense"),
  };
}

export function previousMonth(month: string): string {
  const { year, monthIndex } = parseMonth(month);
  const date = new Date(Date.UTC(year, monthIndex - 1, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthRange(month: string): Readonly<{
  start: string;
  end: string;
}> {
  const { year, monthIndex } = parseMonth(month);
  const start = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, monthIndex + 1, 1));
  const end = `${endDate.getUTCFullYear()}-${String(
    endDate.getUTCMonth() + 1,
  ).padStart(2, "0")}-01`;
  return { start, end };
}

export function calculateDashboardSummary(
  input: DashboardInput,
): DashboardSummary {
  const { year, monthIndex } = parseMonth(input.month);
  const normalizedMonth = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const olderMonth = previousMonth(normalizedMonth);
  const assets = sum(input.assets.map((asset) => asset.amount));
  const debts = sum(input.debts.map((debt) => debt.balanceAmount));

  return {
    month: normalizedMonth,
    netWorth: (assets - debts).toString(),
    currentMonth: summarizePeriod(input.transactions, normalizedMonth),
    previousMonth: summarizePeriod(input.transactions, olderMonth),
  };
}
