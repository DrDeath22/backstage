import { Router, Request, Response } from 'express';
import { DatabaseService } from '../service/DatabaseService';

/** Routes for browsing packages, versions, and binaries */
export function createPackageRoutes(db: DatabaseService): Router {
  const router = Router();

  // GET /stats - Registry statistics
  router.get('/stats', async (_req: Request, res: Response) => {
    const stats = await db.getStats();
    res.json(stats);
  });

  // GET /recent - Recently uploaded versions
  router.get('/recent', async (req: Request, res: Response) => {
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const versions = await db.getRecentVersions(limit);
    res.json(versions);
  });

  // GET /packages/:entityRef/versions - List versions for a catalog entity
  // entityRef is URL-encoded, e.g. component%3Adefault%2Fzlib
  router.get(
    '/packages/:entityRef/versions',
    async (req: Request<{ entityRef: string }>, res: Response) => {
      const entityRef = decodeURIComponent(req.params.entityRef);
      const versions = await db.listVersions(entityRef);
      res.json(versions);
    },
  );

  // GET /packages/:entityRef/versions/:version - Get a specific version
  router.get(
    '/packages/:entityRef/versions/:version',
    async (
      req: Request<{ entityRef: string; version: string }>,
      res: Response,
    ) => {
      const entityRef = decodeURIComponent(req.params.entityRef);
      const version = await db.getVersion(entityRef, req.params.version);
      if (!version) {
        res.status(404).json({ error: 'Version not found' });
        return;
      }
      res.json(version);
    },
  );

  // GET /packages/:entityRef/versions/:version/binaries - List binaries
  router.get(
    '/packages/:entityRef/versions/:version/binaries',
    async (
      req: Request<{ entityRef: string; version: string }>,
      res: Response,
    ) => {
      const entityRef = decodeURIComponent(req.params.entityRef);
      const version = await db.getVersion(entityRef, req.params.version);
      if (!version) {
        res.status(404).json({ error: 'Version not found' });
        return;
      }
      const binaries = await db.listBinaries(version.id);
      res.json(binaries);
    },
  );

  // GET /packages/:entityRef/versions/:version/dependencies - List dependencies
  router.get(
    '/packages/:entityRef/versions/:version/dependencies',
    async (
      req: Request<{ entityRef: string; version: string }>,
      res: Response,
    ) => {
      const entityRef = decodeURIComponent(req.params.entityRef);
      const version = await db.getVersion(entityRef, req.params.version);
      if (!version) {
        res.status(404).json({ error: 'Version not found' });
        return;
      }
      const deps = await db.listDependencies(version.id);
      res.json(deps);
    },
  );

  // GET /packages/:entityRef/versions/:version/recipe - View recipe content
  router.get(
    '/packages/:entityRef/versions/:version/recipe',
    async (
      req: Request<{ entityRef: string; version: string }>,
      res: Response,
    ) => {
      const entityRef = decodeURIComponent(req.params.entityRef);
      const version = await db.getVersion(entityRef, req.params.version);
      if (!version) {
        res.status(404).json({ error: 'Version not found' });
        return;
      }
      res.json({ recipe_content: version.recipe_content });
    },
  );

  return router;
}
