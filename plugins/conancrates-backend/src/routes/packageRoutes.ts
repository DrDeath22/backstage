import { Router, Request, Response } from 'express';
import { DatabaseService } from '../service/DatabaseService';
import { triggerCatalogRefresh } from '../catalogModule';

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

  // GET /packages/:entityRef/versions/:version/graph - Dependency graph for a version
  router.get(
    '/packages/:entityRef/versions/:version/graph',
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
      const binary = binaries[0];
      if (!binary?.dependency_graph) {
        res.json({ nodes: [], edges: [] });
        return;
      }

      const nodes: { id: string; ref: string; name: string; version: string; isRoot: boolean; context: string }[] = [];
      const edges: { from: string; to: string; context: string }[] = [];

      // Conan graph nodes: key is nodeId, edges stored in each node's "dependencies" map
      // dependency_graph is stored as a JSON string in SQLite; parse it if needed
      let parsedGraph: unknown = binary.dependency_graph;
      if (typeof parsedGraph === 'string') {
        try { parsedGraph = JSON.parse(parsedGraph); } catch { parsedGraph = undefined; }
      }
      const graphDataFull = parsedGraph as {
        graph?: {
          nodes?: Record<string, {
            ref?: string;
            context?: string;
            dependencies?: Record<string, { build?: boolean; test?: boolean }>;
          }>;
        };
      };
      const fullNodes = graphDataFull?.graph?.nodes || {};

      // First pass: collect all nodes
      for (const [nodeId, node] of Object.entries(fullNodes)) {
        const ref = node.ref || '';
        const parts = ref.split('/');
        const rawVersion = parts[1] || '';
        // Strip recipe revision hash (e.g. "1.0.0#8f4cf6..." → "1.0.0")
        const ver = rawVersion.split('#')[0];
        nodes.push({
          id: nodeId,
          ref,
          name: parts[0] || ref,
          version: ver,
          isRoot: nodeId === '0',
          context: 'requires', // will be overridden by edge data
        });
      }

      // Second pass: build edges using dep-level build/test flags
      // nodeId → context map derived from how parents depend on this node
      const nodeContextMap: Record<string, string> = {};
      for (const [nodeId, node] of Object.entries(fullNodes)) {
        if (node.dependencies) {
          for (const [depId, depInfo] of Object.entries(node.dependencies)) {
            const edgeContext = depInfo.test ? 'test' : depInfo.build ? 'build' : 'requires';
            edges.push({ from: nodeId, to: depId, context: edgeContext });
            // A node is 'build' or 'test' if at least one parent marks it as such
            if (!nodeContextMap[depId] || edgeContext !== 'requires') {
              nodeContextMap[depId] = edgeContext;
            }
          }
        }
      }

      // Update node contexts based on edge data
      for (const node of nodes) {
        if (!node.isRoot && nodeContextMap[node.id]) {
          node.context = nodeContextMap[node.id];
        }
      }

      res.json({ nodes, edges });
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

  // DELETE /packages/:entityRef/versions/:version - Delete a specific version
  router.delete(
    '/packages/:entityRef/versions/:version',
    async (
      req: Request<{ entityRef: string; version: string }>,
      res: Response,
    ) => {
      try {
        const entityRef = decodeURIComponent(req.params.entityRef);
        const deleted = await db.deleteVersion(entityRef, req.params.version);
        if (!deleted) {
          res.status(404).json({ error: 'Version not found' });
          return;
        }
        res.json({ status: 'ok', message: `Deleted ${entityRef} version ${req.params.version}` });
        triggerCatalogRefresh().catch(() => {});
      } catch (err) {
        console.error('Delete version error:', err);
        res.status(500).json({ error: String(err) });
      }
    },
  );

  // DELETE /packages/:entityRef - Delete all versions of a package
  router.delete(
    '/packages/:entityRef',
    async (req: Request<{ entityRef: string }>, res: Response) => {
      try {
        const entityRef = decodeURIComponent(req.params.entityRef);
        const count = await db.deletePackage(entityRef);
        if (count === 0) {
          res.status(404).json({ error: 'Package not found' });
          return;
        }
        res.json({ status: 'ok', message: `Deleted ${count} version(s) of ${entityRef}` });
        triggerCatalogRefresh().catch(() => {});
      } catch (err) {
        console.error('Delete package error:', err);
        res.status(500).json({ error: String(err) });
      }
    },
  );

  return router;
}
