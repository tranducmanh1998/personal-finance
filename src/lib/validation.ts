import { z } from "zod";
import { DomainError, type FieldError } from "./errors";

export function validateInput<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
): z.infer<Schema> {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }

  const fields: FieldError[] = result.error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
  throw new DomainError("INVALID_INPUT", fields);
}
