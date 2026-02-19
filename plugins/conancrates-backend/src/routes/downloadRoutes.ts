import { Router, Request, Response } from 'express';
import { DatabaseService } from '../service/DatabaseService';
import { StorageProvider } from '../service/StorageService';

/** Routes for downloading binaries, bundles, and rust crates */
export function createDownloadRoutes(
  db: DatabaseService,
  storage: StorageProvider,
): Router {
  const router = Router();

  // GET /packages/:entityRef/versions/:version/binaries/:packageId/download
  // Stream a single binary file
  router.get(
    '/packages/:entityRef/versions/:version/binaries/:packageId/download',
    async (req: Request<{ entityRef: string; version: string; packageId: string }>, res: Response) => {
      try {
        const binary = await db.getBinary(req.params.packageId);
        if (!binary || !binary.binary_file_path) {
          res.status(404).json({ error: 'Binary not found' });
          return;
        }

        await db.incrementDownloadCount(binary.id);

        const [bucket, ...keyParts] = binary.binary_file_path.split('/');
        const key = keyParts.join('/');
        const stream = await storage.readStream(bucket, key);

        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${key}"`,
        );
        if (binary.file_size) {
          res.setHeader('Content-Length', binary.file_size.toString());
        }

        stream.pipe(res);
      } catch (err) {
        console.error('Download error:', err);
        res.status(500).json({ error: String(err) });
      }
    },
  );

  // GET /packages/:entityRef/versions/:version/binaries/:packageId/rust-crate
  // Download a Rust -sys crate file
  router.get(
    '/packages/:entityRef/versions/:version/binaries/:packageId/rust-crate',
    async (req: Request<{ entityRef: string; version: string; packageId: string }>, res: Response) => {
      try {
        const binary = await db.getBinary(req.params.packageId);
        if (!binary || !binary.rust_crate_file_path) {
          res.status(404).json({ error: 'Rust crate not found' });
          return;
        }

        const [bucket, ...keyParts] = binary.rust_crate_file_path.split('/');
        const key = keyParts.join('/');
        const stream = await storage.readStream(bucket, key);

        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${key}"`,
        );

        stream.pipe(res);
      } catch (err) {
        console.error('Rust crate download error:', err);
        res.status(500).json({ error: String(err) });
      }
    },
  );

  // GET /packages/:entityRef/versions/:version/bundle/preview
  // Preview what would be in a bundle download
  router.get(
    '/packages/:entityRef/versions/:version/bundle/preview',
    async (req: Request<{ entityRef: string; version: string }>, res: Response) => {
      try {
        const entityRef = decodeURIComponent(req.params.entityRef);
        const pkgVersion = await db.getVersion(
          entityRef,
          req.params.version,
        );
        if (!pkgVersion) {
          res.status(404).json({ error: 'Version not found' });
          return;
        }

        const binaries = await db.listBinaries(pkgVersion.id);
        // Find matching binary by query params
        const binary = binaries.find(b => {
          if (req.query.os && b.os !== req.query.os) return false;
          if (req.query.arch && b.arch !== req.query.arch) return false;
          if (req.query.compiler && b.compiler !== req.query.compiler)
            return false;
          return true;
        }) || binaries[0];

        if (!binary) {
          res.status(404).json({ error: 'No matching binary found' });
          return;
        }

        // Traverse dependency graph to list all packages in bundle
        const packages: Array<{
          name: string;
          version: string;
          package_id: string;
        }> = [];
        const graph = binary.dependency_graph as {
          graph?: { nodes?: Record<string, { ref?: string; package_id?: string }> };
        };

        if (graph?.graph?.nodes) {
          for (const node of Object.values(graph.graph.nodes)) {
            if (node.ref && node.package_id) {
              const [name, ver] = node.ref.split('/');
              if (name && ver) {
                packages.push({
                  name,
                  version: ver.split('#')[0],
                  package_id: node.package_id,
                });
              }
            }
          }
        }

        res.json({
          main_package: {
            entity_ref: entityRef,
            version: req.params.version,
            package_id: binary.package_id,
            settings: {
              os: binary.os,
              arch: binary.arch,
              compiler: binary.compiler,
              compiler_version: binary.compiler_version,
              build_type: binary.build_type,
            },
          },
          dependencies: packages,
          total_packages: packages.length + 1,
        });
      } catch (err) {
        console.error('Bundle preview error:', err);
        res.status(500).json({ error: String(err) });
      }
    },
  );

  // TODO: GET /packages/:entityRef/versions/:version/bundle
  //       Full bundle download (ZIP with main + all deps)
  //       This is complex - will be implemented in Phase 2

  // TODO: GET /packages/:entityRef/versions/:version/binaries/:packageId/download/extracted
  //       Extracted format download

  // TODO: GET /packages/:entityRef/versions/:version/bundle/extracted
  //       Extracted bundle download

  // TODO: GET /packages/:entityRef/versions/:version/binaries/:packageId/rust-bundle
  //       Rust crate bundle download

  return router;
}
