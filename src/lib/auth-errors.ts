export function signInErrorMessage(code: string | undefined): string {
  if (code === "INVALID_EMAIL_OR_PASSWORD") {
    return "Email hoặc mật khẩu không đúng.";
  }

  if (code === "INVALID_ORIGIN") {
    return "Địa chỉ truy cập không hợp lệ. Hãy mở lại ứng dụng từ cổng Codespaces.";
  }

  return "Không thể đăng nhập lúc này. Vui lòng thử lại.";
}
