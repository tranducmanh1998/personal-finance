import { expect, test } from "@playwright/test";

test("renders the public login page", async ({ page }) => {
  await page.goto("/login");

  await expect(
    page.getByRole("heading", { name: "Quản lý tài chính cá nhân" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Đăng nhập" })).toBeVisible();
});

test("redirects unauthenticated users from finance pages to login", async ({
  page,
}) => {
  await page.goto("/dashboard");

  await expect(page).toHaveURL(/\/login$/);
});

test("shows a Vietnamese message for invalid login credentials", async ({
  page,
}) => {
  const authenticationErrorEvents: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      message.text().includes('"event":"authentication_failed"')
    ) {
      authenticationErrorEvents.push(message.text());
    }
  });

  await page.goto("/login");
  await page.getByLabel("Email").fill("nobody@example.invalid");
  await page.getByLabel("Mật khẩu").fill("wrong-test-password");
  await page.getByRole("button", { name: "Đăng nhập" }).click();

  await expect(page.locator("form").getByRole("alert")).toHaveText(
    "Email hoặc mật khẩu không đúng.",
  );
  expect(authenticationErrorEvents).toEqual([]);
});
