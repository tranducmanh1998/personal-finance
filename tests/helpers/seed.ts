import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type FakeSeed = Readonly<{
  user: {
    id: string;
    email: string;
    name: string;
  };
  finance: {
    transactions: Array<{
      id: string;
      kind: "income" | "expense";
      amount: string;
      occurredOn: string;
      category: string;
    }>;
    assetBalances: Array<{
      kind: "cash" | "savings_deposit" | "cash_equivalent";
      amount: string;
    }>;
    debts: Array<{
      id: string;
      balanceAmount: string;
    }>;
  };
}>;

async function loadJson<T>(path: string): Promise<T> {
  const contents = await readFile(join(process.cwd(), path), "utf8");
  return JSON.parse(contents) as T;
}

export async function loadFakeSeed(): Promise<FakeSeed> {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Fake seed data can only be loaded in the test runtime.");
  }

  const [user, finance] = await Promise.all([
    loadJson<FakeSeed["user"]>("tests/fixtures/users/fake-user.json"),
    loadJson<FakeSeed["finance"]>("tests/fixtures/finance/base.json"),
  ]);
  return { user, finance };
}
