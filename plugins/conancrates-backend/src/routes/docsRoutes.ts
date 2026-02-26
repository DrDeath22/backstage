import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseService } from '../service/DatabaseService';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.ico': 'image/x-icon',
};

/** Routes for serving generated API documentation */
export function createDocsRoutes(
  db: DatabaseService,
  docsRootPath: string,
): Router {
  const router = Router();

  // GET /packages/:entityRef/versions/:version/api-docs/status
  router.get(
    '/packages/:entityRef/versions/:version/api-docs/status',
    async (req: Request<{ entityRef: string; version: string }>, res: Response) => {
      const entityRef = decodeURIComponent(req.params.entityRef);
      const version = await db.getVersion(entityRef, req.params.version);
      if (!version) {
        res.status(404).json({ error: 'Version not found' });
        return;
      }
      res.json({
        status: version.api_docs_status || 'none',
        error: version.api_docs_error || '',
      });
    },
  );

  // GET /packages/:entityRef/versions/:version/api-docs/*
  // Serve individual doc files (HTML, CSS, JS, images, fonts)
  router.get(
    '/packages/:entityRef/versions/:version/api-docs/*',
    async (req: Request<{ entityRef: string; version: string }>, res: Response) => {
      const entityRef = decodeURIComponent(req.params.entityRef);
      const version = await db.getVersion(entityRef, req.params.version);
      if (
        !version ||
        version.api_docs_status !== 'ready' ||
        !version.api_docs_path
      ) {
        res.status(404).json({ error: 'API docs not available' });
        return;
      }

      // Extract the file path from the wildcard
      const filePath = (req.params as Record<string, string>)[0] || 'index.html';

      // Resolve and validate path (prevent directory traversal)
      const resolvedRoot = path.resolve(docsRootPath);
      const fullPath = path.resolve(docsRootPath, version.api_docs_path, filePath);
      if (!fullPath.startsWith(resolvedRoot)) {
        res.status(403).json({ error: 'Invalid path' });
        return;
      }

      try {
        const stat = await fs.promises.stat(fullPath);
        if (!stat.isFile()) {
          res.status(404).json({ error: 'Not found' });
          return;
        }

        const ext = path.extname(fullPath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', stat.size.toString());

        const stream = fs.createReadStream(fullPath);
        stream.pipe(res);
      } catch {
        res.status(404).json({ error: 'File not found' });
      }
    },
  );

  return router;
}
