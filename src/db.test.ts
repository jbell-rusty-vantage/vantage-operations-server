import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";
import { readConfig } from "./config";
import { createMongoConnection } from "./db";

test("concurrent cold requests share one connection and bound its production footprint", async (t) => {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  const connect = t.mock.method(mongoose, "connect", async (_uri: string, options?: mongoose.ConnectOptions) => {
    assert.equal(options?.dbName, "vantagemovers");
    assert.equal(options?.maxPoolSize, 5);
    assert.equal(options?.minPoolSize, 0);
    assert.equal(options?.autoIndex, false);
    assert.equal(options?.autoCreate, false);
    await wait;
    return mongoose;
  });
  const getConnection = createMongoConnection(readConfig({ MONGO_URI: "mongodb://unused" }));
  const first = getConnection();
  const second = getConnection();
  assert.equal(connect.mock.callCount(), 1);
  release();
  await Promise.all([first, second]);
});

test("failed initial connections can retry on the next request", async (t) => {
  let attempts = 0;
  t.mock.method(mongoose, "connect", async () => {
    if (++attempts === 1) throw new Error("synthetic connection failure");
    return mongoose;
  });
  const getConnection = createMongoConnection(readConfig({ MONGO_URI: "mongodb://unused" }));
  await assert.rejects(getConnection(), /synthetic/);
  await getConnection();
  assert.equal(attempts, 2);
});

test("unconfigured Mongo fails without trying to connect", async (t) => {
  const connect = t.mock.method(mongoose, "connect");
  await assert.rejects(createMongoConnection(readConfig({}))(), /not configured/);
  assert.equal(connect.mock.callCount(), 0);
});
