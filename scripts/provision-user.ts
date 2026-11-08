import "dotenv/config";
import { hashPassword } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { createInterface } from "node:readline/promises";
import { account, user } from "../src/db/schema";
import { closeDb, getDb } from "../src/db";

async function readHidden(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Run account provisioning from an interactive terminal.");
  }

  process.stdout.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  return new Promise((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
    };
    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          cleanup();
          reject(new Error("Account provisioning cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          const characters = Array.from(value);
          characters.pop();
          value = characters.join("");
          process.stdout.write("\b \b");
          continue;
        }
        value += character;
        process.stdout.write("*");
      }
    };
    process.stdin.on("data", onData);
  });
}

async function main(): Promise<void> {
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const email = (await prompt.question("Email tài khoản: "))
    .trim()
    .toLowerCase();
  const name = (await prompt.question("Tên hiển thị: ")).trim();
  prompt.close();

  const password = await readHidden("Mật khẩu (không hiển thị): ");
  const confirmation = await readHidden("Nhập lại mật khẩu: ");
  if (password.length < 8) {
    throw new Error("Mật khẩu phải có ít nhất 8 ký tự.");
  }
  if (password !== confirmation) {
    throw new Error("Hai lần nhập mật khẩu không khớp.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) {
    throw new Error("Email hoặc tên hiển thị không hợp lệ.");
  }

  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(424242)`);
    const existingUsers = await tx.select({ id: user.id }).from(user).limit(1);
    if (existingUsers.length > 0) {
      throw new Error(
        "Tài khoản đã được khởi tạo; từ chối tạo thêm người dùng.",
      );
    }

    const userId = crypto.randomUUID();
    const timestamp = new Date();
    const normalizedEmail = email.toLowerCase();
    const passwordHash = await hashPassword(password);

    await tx.insert(user).values({
      id: userId,
      name,
      email: normalizedEmail,
      emailVerified: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await tx.insert(account).values({
      id: crypto.randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: passwordHash,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  });

  console.info(
    "Đã tạo tài khoản ban đầu. Hãy lưu thông tin đăng nhập ngoài Git.",
  );
}

try {
  await main();
} catch (error) {
  console.error("Không thể tạo tài khoản ban đầu.");
  console.error(error instanceof Error ? error.message : "Lỗi không xác định.");
  process.exitCode = 1;
} finally {
  await closeDb();
}
