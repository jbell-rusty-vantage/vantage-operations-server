import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { test } from "node:test";
import { createApp } from "./app";
import { readConfig } from "./config";

const config = readConfig({ VANTAGE_API_SECRET: "test-only-secret", LOG_LEVEL: "silent" });

test("public probes work without Mongo or credentials; unknown routes are JSON", async (t) => {
  let databaseCalls = 0;
  const app = createApp({ config, checkDatabase: async () => { databaseCalls++; } });
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const path of ["/", "/health"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-powered-by"), null);
    assert.ok(response.headers.get("x-request-id"));
  }
  const missing = await fetch(base + "/missing");
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { ok: false, error: "NOT_FOUND" });
  assert.equal(databaseCalls, 0);
});

test("readiness requires a configured matching secret before any Mongo call", async (t) => {
  let databaseCalls = 0;
  const app = createApp({ config, checkDatabase: async () => { databaseCalls++; } });
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/health/ready`;
  const deniedHeaders: Record<string, string>[] = [{}, { "x-api-secret": "incorrect" }, { Authorization: "Bearer test-only-secret" }];
  for (const headers of deniedHeaders) {
    assert.equal((await fetch(url, { headers })).status, 401);
  }
  assert.equal(databaseCalls, 0);
  const response = await fetch(url, { headers: { "x-api-secret": "test-only-secret" } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: "vantage-operations-server", database: "ready" });
  assert.equal(databaseCalls, 1);
});

test("missing auth and failing Mongo do not disclose dependency details", async (t) => {
  const servers: Server[] = [];
  for (const [apiSecret, expectedStatus, expectedError] of [
    [undefined, 503, "API_AUTH_NOT_CONFIGURED"],
    ["test-only-secret", 503, "DATABASE_UNAVAILABLE"],
  ] as const) {
    const app = createApp({ config: { ...config, apiSecret }, checkDatabase: async () => {
      throw new Error("mongodb://private-user:private-password@private-host");
    } });
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/health/ready`, {
      headers: { "x-api-secret": "test-only-secret" },
    });
    assert.equal(response.status, expectedStatus);
    assert.deepEqual(await response.json(), { ok: false, error: expectedError });
  }
  t.after(() => Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve())))));
});

test("CORS grants only configured origins and malformed bodies return JSON errors", async (t) => {
  const app = createApp({ config: { ...config, corsOrigins: ["https://allowed.example"] } });
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  assert.equal((await fetch(base + "/health", { headers: { Origin: "https://allowed.example" } })).headers.get("access-control-allow-origin"), "https://allowed.example");
  assert.equal((await fetch(base + "/health", { headers: { Origin: "https://other.example" } })).headers.get("access-control-allow-origin"), null);
  const malformed = await fetch(base + "/api/v1/missing", { method: "POST", headers: {
    "Content-Type": "application/json", "x-api-secret": "test-only-secret",
  }, body: "{" });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { ok: false, error: "INVALID_BODY" });
});
