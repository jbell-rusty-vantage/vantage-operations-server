import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler, Request, Response, NextFunction } from "express";

export function requireApiSecret(expected: string | undefined): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!expected) {
      res.status(503).json({ ok: false, error: "API_AUTH_NOT_CONFIGURED" });
      return;
    }
    const provided = req.header("x-api-secret");
    if (!provided || !timingSafeEqual(
      createHash("sha256").update(provided).digest(),
      createHash("sha256").update(expected).digest(),
    )) {
      res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
      return;
    }
    next();
  };
}
