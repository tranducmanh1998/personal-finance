import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/session";
import { closeMissingMonthsThroughPreviousMonth } from "@/features/history/history.service";

export default async function FinanceLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const currentSession = await requireSession();
  await closeMissingMonthsThroughPreviousMonth(currentSession.user.id);
  return <AppShell name={currentSession.user.name}>{children}</AppShell>;
}
