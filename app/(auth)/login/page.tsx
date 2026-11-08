import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { getCurrentSession } from "@/lib/session";

export default async function LoginPage() {
  const currentSession = await getCurrentSession();
  if (currentSession) {
    redirect("/dashboard");
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <h1 id="login-title">Quản lý tài chính cá nhân</h1>
        <p className="muted">Đăng nhập để tiếp tục.</p>
        <LoginForm />
      </section>
    </main>
  );
}
