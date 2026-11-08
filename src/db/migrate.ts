import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "./index";

try {
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  console.info("Database migrations applied.");
} finally {
  await closeDb();
}
