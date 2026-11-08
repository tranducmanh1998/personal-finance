"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { logError } from "@/lib/logger";

export function SignOutButton() {
  const router = useRouter();
  const [error, setError] = useState(false);

  async function signOut() {
    setError(false);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        logError("authentication_failed");
        setError(true);
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch {
      logError("authentication_failed");
      setError(true);
    }
  }

  return (
    <span>
      <button className="sign-out-button" onClick={signOut} type="button">
        Đăng xuất
      </button>
      {error ? (
        <span className="error-message" role="alert">
          Không thể đăng xuất. Vui lòng thử lại.
        </span>
      ) : null}
    </span>
  );
}
