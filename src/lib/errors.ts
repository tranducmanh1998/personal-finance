export type DomainErrorCode =
  "INVALID_INPUT" | "UNAUTHORIZED" | "NOT_FOUND" | "CONFLICT";

export type FieldError = Readonly<{
  field: string;
  message: string;
}>;

const publicMessages: Record<DomainErrorCode, string> = {
  INVALID_INPUT: "Dữ liệu nhập chưa hợp lệ.",
  UNAUTHORIZED: "Bạn không có quyền thực hiện thao tác này.",
  NOT_FOUND: "Không tìm thấy dữ liệu yêu cầu.",
  CONFLICT: "Dữ liệu đang xung đột với một thay đổi khác.",
};

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly fields: readonly FieldError[];

  constructor(code: DomainErrorCode, fields: readonly FieldError[] = []) {
    super(publicMessages[code]);
    this.name = "DomainError";
    this.code = code;
    this.fields = fields;
  }

  toResponse() {
    return {
      error: {
        code: this.code,
        message: this.message,
        fields: this.fields,
      },
    };
  }
}
