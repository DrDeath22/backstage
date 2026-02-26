import { Router } from 'express';
import { DatabaseService } from './service/DatabaseService';
import { StorageProvider } from './service/StorageService';
import { DocGenerationService } from './service/DocGenerationService';
import { createPackageRoutes } from './routes/packageRoutes';
import { createUploadRoutes } from './routes/uploadRoutes';
import { createDownloadRoutes } from './routes/downloadRoutes';
import { createDocsRoutes } from './routes/docsRoutes';
import { triggerCatalogRefresh } from './catalogModule';

export interface RouterOptions {
  database: DatabaseService;
  storage: StorageProvider;
  docGeneration?: DocGenerationService;
}

export async function createRouter(options: RouterOptions): Promise<Router> {
  const { database, storage, docGeneration } = options;
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
  router.use('/', createPackageRoutes(database, storage.getRootPath()));
  router.use('/', createUploadRoutes(database, storage, docGeneration));
  router.use('/', createDownloadRoutes(database, storage));
  router.use('/', createDocsRoutes(database, storage.getRootPath()));

  return router;
}
