"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { signInErrorMessage } from "@/lib/auth-errors";
import { logError } from "@/lib/logger";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData(event.currentTarget);
    try {
      const result = await authClient.signIn.email({
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
      });

      if (result.error) {
        if (result.error.code !== "INVALID_EMAIL_OR_PASSWORD") {
          logError("authentication_failed");
        }
        setError(signInErrorMessage(result.error.code));
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      logError("authentication_failed");
      setError("Không thể kết nối để đăng nhập. Vui lòng thử lại.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label className="form-field">
        <span>Email</span>
        <input autoComplete="username" name="email" type="email" required />
      </label>
      <label className="form-field">
        <span>Mật khẩu</span>
        <input
          autoComplete="current-password"
          name="password"
          type="password"
          required
        />
      </label>
      <button className="primary-button" disabled={pending} type="submit">
        {pending ? "Đang đăng nhập…" : "Đăng nhập"}
      </button>
      {error ? (
        <p className="error-message" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
