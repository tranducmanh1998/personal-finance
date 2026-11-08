import { describe, expect, it } from "vitest";
import { signInErrorMessage } from "@/lib/auth-errors";

describe("sign-in errors", () => {
  it("uses a generic Vietnamese message for incorrect credentials", () => {
    expect(signInErrorMessage("INVALID_EMAIL_OR_PASSWORD")).toBe(
      "Email hoặc mật khẩu không đúng.",
    );
  });

  it("explains an untrusted origin without exposing server details", () => {
    expect(signInErrorMessage("INVALID_ORIGIN")).toBe(
      "Địa chỉ truy cập không hợp lệ. Hãy mở lại ứng dụng từ cổng Codespaces.",
    );
  });

  it("uses a generic message for unexpected authentication errors", () => {
    expect(signInErrorMessage("INTERNAL_ERROR")).toBe(
      "Không thể đăng nhập lúc này. Vui lòng thử lại.",
    );
  });
});
