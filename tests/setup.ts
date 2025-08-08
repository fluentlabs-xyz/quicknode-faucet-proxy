import { beforeAll, afterAll } from "bun:test";
import { queries } from "../src/database";

beforeAll(async () => {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test_db";
  process.env.PARTNER_API_KEY = "test-partner-key";
  process.env.QUICKNODE_API_URL = "https://test.quicknode.com";
  process.env.MAIN_DISTRIBUTOR_API_KEY = "test-main-key";
  process.env.TEST_DISTRIBUTOR_API_KEY = "test-key";
  process.env.PARA_SECRET_KEY = "test-para-key";
});

afterAll(async () => {
  // Cleanup handled by individual tests
});