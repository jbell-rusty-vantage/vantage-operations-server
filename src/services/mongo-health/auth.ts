import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export const HEALTH_BASE = '/api/v1/mongo-health';
export function healthTarget(target: string): boolean {
  return target === `${HEALTH_BASE}/summary` || target === `${HEALTH_BASE}/collections` ||
    new RegExp(`^${HEALTH_BASE}/collections/[A-Za-z0-9_.-]{1,120}/indexes$`).test(target);
}
export function healthCanonical(actor: string, timestamp: string, requestId: string, target: string) {
  return ['vantage-operations-admin-v1', 'mongo-health', actor, 'owner', timestamp, requestId, 'GET', target,
    createHash('sha256').update('').digest('hex')].join('\n');
}
export function requireHealthOwner(secret?: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!secret || secret.length < 32) { res.status(503).json({ ok: false, error: 'AUTH_UNAVAILABLE' }); return; }
    const names = ['actor-id', 'role', 'timestamp', 'request-id', 'signature'].map(s => `x-vantage-operations-${s}`);
    const values = names.map(name => {
      if (req.rawHeaders.filter((v, i) => i % 2 === 0 && v.toLowerCase() === name).length !== 1) return undefined;
      const value = req.headers[name];
      return typeof value === 'string' && !/[\r\n]/.test(value) ? value : undefined;
    });
    const [actor, role, timestamp, requestId, signature] = values;
    if (req.method !== 'GET' || !healthTarget(req.originalUrl) || req.headers.authorization ||
      req.headers['transfer-encoding'] || (req.headers['content-length'] && req.headers['content-length'] !== '0') ||
      !actor || !/^[a-f0-9]{24}$/.test(actor) || role !== 'owner' || !timestamp || !/^[1-9][0-9]{12}$/.test(timestamp) ||
      Date.now() - Number(timestamp) > 30_000 || Number(timestamp) - Date.now() > 5000 ||
      !requestId || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(requestId) ||
      !signature || !/^[a-f0-9]{64}$/.test(signature)) {
      res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' }); return;
    }
    const expected = createHmac('sha256', secret).update(healthCanonical(actor, timestamp, requestId, req.originalUrl)).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) {
      res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' }); return;
    }
    next();
  };
}
