import cors from "cors";
import express, { type ErrorRequestHandler, type Request, type Response, type NextFunction } from "express";
import helmet from "helmet";
import { readConfig, SERVICE_NAME, type RuntimeConfig } from "./config";
import { createDatabaseReadinessCheck } from "./db";
import { createHttpLogger, createLogger } from "./logger";
import { requireApiSecret } from "./middleware/require-api-secret";

interface AppOptions {
  config?: RuntimeConfig;
  checkDatabase?: () => Promise<void>;
}

export function createApp(options: AppOptions = {}) {
  const config = options.config ?? readConfig();
  const checkDatabase = options.checkDatabase ?? createDatabaseReadinessCheck(config);
  const logger = createLogger(config);
  const app = express();
  app.disable("x-powered-by");
  app.use(createHttpLogger(logger));
  app.use(helmet());
  app.use(cors({
    origin: config.corsOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "x-api-secret"],
    maxAge: 86400,
  }));
  app.get("/", (_req: Request, res: Response) => {
    res.json({ service: SERVICE_NAME, status: "ok", apiVersion: "v1" });
  });
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true, service: SERVICE_NAME });
  });
  app.get("/api/v1/health/ready", requireApiSecret(config.apiSecret), async (_req: Request, res: Response) => {
    try {
      await checkDatabase();
      res.json({ ok: true, service: SERVICE_NAME, database: "ready" });
    } catch {
      logger.warn({ dependency: "mongodb" }, "Database readiness check failed");
      res.status(503).json({ ok: false, error: "DATABASE_UNAVAILABLE" });
    }
  });
  // Future feature routers must install their own actor authentication.
  // The diagnostic secret above is deliberately scoped to readiness only.
  app.use(express.json({ limit: "1mb" }));
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ ok: false, error: "NOT_FOUND" });
  });
  const handleError: ErrorRequestHandler = (error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const status = typeof error === "object" && error !== null && "status" in error
      ? error.status : undefined;
    if (status === 400 || status === 413 || status === 415) {
      res.status(status).json({ ok: false, error: status === 413 ? "BODY_TOO_LARGE" : "INVALID_BODY" });
      return;
    }
    logger.error("Unhandled request failure");
    res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  };
  app.use(handleError);
  return app;
}

export default createApp();
