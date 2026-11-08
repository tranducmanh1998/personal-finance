import { expect, test } from "@playwright/test";

test("rejects invalid login credentials with a localized error", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("missing-user@example.invalid");
  await page.getByLabel("Mật khẩu").fill("invalid-e2e-password");
  await page.getByRole("button", { name: "Đăng nhập" }).click();

  await expect(page.locator("form").getByRole("alert")).toHaveText(
    "Email hoặc mật khẩu không đúng.",
  );
});

test("redirects all protected finance pages to login when unauthenticated", async ({
  page,
}) => {
  for (const route of [
    "/dashboard",
    "/transactions",
    "/debts",
    "/cash-flow",
    "/goals",
    "/assets",
    "/history",
    "/history/backfill",
  ]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("does not allow public email and password sign-up", async ({
  request,
}) => {
  const response = await request.post("/api/auth/sign-up/email", {
    headers: { origin: "http://localhost:3000" },
    data: {
      name: "Synthetic disabled sign-up check",
      email: `disabled-sign-up-${Date.now()}@example.invalid`,
      password: "synthetic-sign-up-test-password",
    },
  });

  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    code: "EMAIL_PASSWORD_SIGN_UP_DISABLED",
  });
  expect(response.headers()["set-cookie"]).toBeUndefined();
});
