import dns from "node:dns";
import mongoose from "mongoose";
import type { RuntimeConfig } from "./config";

export function createMongoConnection(config: RuntimeConfig) {
  let pending: Promise<typeof mongoose> | undefined;

  return async function connectMongo(): Promise<void> {
    if (!config.mongoUri) {
      throw new Error("MongoDB is not configured");
    }
    if (mongoose.connection.readyState === 1) {
      return;
    }
    if (!pending) {
      if (config.mongoDnsServers.length) {
        dns.setServers(config.mongoDnsServers);
      }
      pending = mongoose.connect(config.mongoUri, {
        dbName: config.databaseName,
        maxPoolSize: 5,
        minPoolSize: 0,
        maxIdleTimeMS: 60_000,
        serverSelectionTimeoutMS: 5_000,
        socketTimeoutMS: 45_000,
        bufferCommands: false,
        autoCreate: false,
        autoIndex: false,
      });
    }
    try {
      await pending;
    } finally {
      // Reuse connected sockets; a failed or later-disconnected client can retry.
      pending = undefined;
    }
  };
}

export function createDatabaseReadinessCheck(config: RuntimeConfig) {
  const connectMongo = createMongoConnection(config);
  return async () => {
    await connectMongo();
    if (!mongoose.connection.db) {
      throw new Error("Database connection is unavailable");
    }
    await mongoose.connection.db.command({ ping: 1 }, { timeoutMS: 3000 });
  };
}
