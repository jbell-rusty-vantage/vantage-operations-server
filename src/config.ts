export const SERVICE_NAME = "vantage-operations-server";
export const PRODUCTION_DATABASE_NAME = "vantagemovers";

export interface RuntimeConfig {
  mongoUri?: string;
  databaseName: string;
  mongoDnsServers: string[];
  apiSecret?: string;
  corsOrigins: string[];
  port: number;
  logLevel: string;
}

function commaList(value: string | undefined): string[] {
  return (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const testMode = env.TEST_MODE?.trim() || "false";
  if (testMode !== "true" && testMode !== "false") {
    throw new Error("TEST_MODE must be true or false");
  }
  const databaseName = testMode === "true"
    ? env.TEST_MONGO_DATABASE_NAME?.trim() || "testvantagemovers"
    : PRODUCTION_DATABASE_NAME;
  if (testMode === "true" && databaseName === PRODUCTION_DATABASE_NAME) {
    throw new Error("TEST_MODE cannot target the production database");
  }
  const port = Number(env.PORT?.trim() || "3001");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  const logLevel = env.LOG_LEVEL?.trim() || "info";
  if (!["fatal", "error", "warn", "info", "debug", "trace", "silent"].includes(logLevel)) {
    throw new Error("LOG_LEVEL is invalid");
  }
  return {
    mongoUri: env.MONGO_URI?.trim() || undefined,
    databaseName,
    mongoDnsServers: commaList(env.MONGO_DNS_SERVERS),
    apiSecret: env.VANTAGE_API_SECRET?.trim() || undefined,
    corsOrigins: commaList(env.CORS_ALLOWED_ORIGINS),
    port,
    logLevel,
  };
}
