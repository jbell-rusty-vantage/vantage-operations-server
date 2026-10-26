import { randomUUID } from "node:crypto";
import pino from "pino";
import pinoHttp from "pino-http";
import { SERVICE_NAME, type RuntimeConfig } from "./config";

export function createLogger(config: RuntimeConfig) {
  return pino({
    level: config.logLevel,
    base: { service: SERVICE_NAME },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
  });
}

export function createHttpLogger(logger: pino.Logger) {
  return pinoHttp({
    logger,
    genReqId: (_req, res) => {
      const id = randomUUID();
      res.setHeader("x-request-id", id);
      return id;
    },
    // Exclude headers, query strings, bodies and raw dependency errors.
    serializers: {
      req: (req) => ({ id: req.id, method: req.method }),
      res: (res) => ({ statusCode: res.statusCode }),
      err: () => ({ message: "HTTP request failed" }),
    },
  });
}
