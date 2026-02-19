import { Router } from 'express';
import { DatabaseService } from './service/DatabaseService';
import { StorageProvider } from './service/StorageService';
import { createPackageRoutes } from './routes/packageRoutes';
import { createUploadRoutes } from './routes/uploadRoutes';
import { createDownloadRoutes } from './routes/downloadRoutes';
import { triggerCatalogRefresh } from './catalogModule';

export interface RouterOptions {
  database: DatabaseService;
  storage: StorageProvider;
}

export async function createRouter(options: RouterOptions): Promise<Router> {
  const { database, storage } = options;
  const router = Router();

  // Health check
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Manual catalog refresh trigger
  router.post('/refresh-catalog', async (_req, res) => {
    await triggerCatalogRefresh();
    res.json({ status: 'ok', message: 'Catalog refresh triggered' });
  });

  // Mount route groups
  router.use('/', createPackageRoutes(database));
  router.use('/', createUploadRoutes(database, storage));
  router.use('/', createDownloadRoutes(database, storage));

  return router;
}
