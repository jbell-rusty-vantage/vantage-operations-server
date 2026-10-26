import assert from "node:assert/strict";
import { test } from "node:test";
import { readConfig } from "./config";

test("production uses the existing database even if URI names another database", () => {
  const config = readConfig({ MONGO_URI: "mongodb://localhost/accidental-other-db" });
  assert.equal(config.databaseName, "vantagemovers");
  assert.equal(config.port, 3001);
});

test("test mode is explicit and cannot select the production database", () => {
  assert.equal(readConfig({ TEST_MODE: "true" }).databaseName, "testvantagemovers");
  assert.throws(() => readConfig({ TEST_MODE: "typo" }), /TEST_MODE/);
  assert.throws(() => readConfig({ TEST_MODE: "true", TEST_MONGO_DATABASE_NAME: "vantagemovers" }), /production/);
});

test("configuration rejects invalid ports and logging levels", () => {
  for (const port of ["0", "65536", "abc", "3001.5"]) {
    assert.throws(() => readConfig({ PORT: port }), /PORT/);
  }
  assert.throws(() => readConfig({ LOG_LEVEL: "verbose" }), /LOG_LEVEL/);
  assert.deepEqual(readConfig({ CORS_ALLOWED_ORIGINS: " https://example.com, " }).corsOrigins, ["https://example.com"]);
});
