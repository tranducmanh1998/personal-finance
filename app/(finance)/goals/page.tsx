import { requireUserId } from "@/lib/dal";
import { listGoalTransactions, listGoals } from "@/features/goals/goal.service";
import { GoalManager } from "./goal-manager";

export default async function GoalsPage() {
  const userId = await requireUserId();
  const goals = await listGoals(userId);
  const transactionsByGoal = new Map(
    await Promise.all(
      goals.map(
        async (goal) =>
          [goal.id, await listGoalTransactions(userId, goal.id)] as const,
      ),
    ),
  );

  return (
    <section>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Tiết kiệm</p>
          <h1>Mục tiêu tiết kiệm</h1>
          <p className="muted">
            Tiến độ chỉ tính từ giao dịch được bạn liên kết với từng mục tiêu.
          </p>
        </div>
      </header>
      <GoalManager goals={goals} transactionsByGoal={transactionsByGoal} />
    </section>
  );
}
