import "dotenv/config";
import { assertIsolatedTestDatabase } from "../../src/db/test-database-guard";

assertIsolatedTestDatabase(
  process.env.TEST_DATABASE_URL,
  process.env.DATABASE_URL,
);
