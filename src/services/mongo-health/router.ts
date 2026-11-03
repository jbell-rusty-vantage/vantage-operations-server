import { Router } from 'express';
import { requireHealthOwner } from './auth';
import type { MongoHealthService } from './service';

export function mongoHealthRouter(service: MongoHealthService, secret?: string) {
  const router = Router();
  router.use(requireHealthOwner(secret));
  router.get('/summary', async (_req, res) => {
    try { res.json({ ok: true, data: await service.summary() }); }
    catch { res.status(503).json({ ok: false, error: 'MONGO_HEALTH_UNAVAILABLE' }); }
  });
  router.get('/collections', async (_req, res) => {
    try { res.json({ ok: true, data: await service.collections() }); }
    catch { res.status(503).json({ ok: false, error: 'MONGO_HEALTH_UNAVAILABLE' }); }
  });
  router.get('/collections/:name/indexes', async (req, res) => {
    try {
      const data = await service.indexes(req.params.name as string);
      if (!data) { res.status(404).json({ ok: false, error: 'COLLECTION_NOT_FOUND' }); return; }
      res.json({ ok: true, data });
    } catch { res.status(503).json({ ok: false, error: 'MONGO_HEALTH_UNAVAILABLE' }); }
  });
  return router;
}
