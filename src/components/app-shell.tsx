import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "./sign-out-button";

export function AppShell({
  children,
  name,
}: Readonly<{ children: ReactNode; name: string }>) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <p className="app-brand">Quản lý tài chính cá nhân</p>
        <div>
          <span className="muted">{name}</span> <SignOutButton />
        </div>
      </header>
      <nav className="app-nav" aria-label="Điều hướng chính">
        <Link href="/dashboard">Tổng quan</Link>
        <Link href="/assets">Tài sản</Link>
        <Link href="/debts">Khoản nợ</Link>
        <Link href="/transactions">Giao dịch</Link>
        <Link href="/cash-flow">Dòng tiền</Link>
        <Link href="/history">Lịch sử</Link>
        <Link href="/goals">Mục tiêu</Link>
        <Link href="/categories">Danh mục</Link>
      </nav>
      <main className="page-content">{children}</main>
    </div>
  );
}
