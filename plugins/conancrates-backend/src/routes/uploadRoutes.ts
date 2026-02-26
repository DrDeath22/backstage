import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import { DatabaseService } from '../service/DatabaseService';
import { StorageProvider } from '../service/StorageService';
import { DocGenerationService } from '../service/DocGenerationService';
import { triggerCatalogRefresh } from '../catalogModule';

const upload = multer({ storage: multer.memoryStorage() });

/**
 * Parse metadata from conanfile.py content.
 * Ported from Django simple_upload.py parse_conanfile().
 */
function parseConanfile(recipeContent: string): {
  name: string | null;
  version: string | null;
  description: string;
  license: string;
  author: string;
  homepage: string;
  topics: string[];
  dependencies: string[];
} {
  const metadata = {
    name: null as string | null,
    version: null as string | null,
    description: '',
    license: 'Unknown',
    author: '',
    homepage: '',
    topics: [] as string[],
    dependencies: [] as string[],
  };

  const nameMatch = recipeContent.match(/name\s*=\s*["']([^"']+)["']/);
  if (nameMatch) metadata.name = nameMatch[1];

  const versionMatch = recipeContent.match(/version\s*=\s*["']([^"']+)["']/);
  if (versionMatch) metadata.version = versionMatch[1];

  const descMatch = recipeContent.match(/description\s*=\s*["']([^"']+)["']/);
  if (descMatch) metadata.description = descMatch[1];

  const licenseMatch = recipeContent.match(/license\s*=\s*["']([^"']+)["']/);
  if (licenseMatch) metadata.license = licenseMatch[1];

  const authorMatch = recipeContent.match(/author\s*=\s*["']([^"']+)["']/);
  if (authorMatch) metadata.author = authorMatch[1];

  // Conan uses both 'homepage' and 'url'
  const homepageMatch = recipeContent.match(/homepage\s*=\s*["']([^"']+)["']/);
  if (homepageMatch) {
    metadata.homepage = homepageMatch[1];
  } else {
    const urlMatch = recipeContent.match(/url\s*=\s*["']([^"']+)["']/);
    if (urlMatch) metadata.homepage = urlMatch[1];
  }

  // Topics can be tuple, list, or set in Python
  const topicsMatch = recipeContent.match(/topics\s*=\s*[(\[{](.*?)[)\]}]/s);
  if (topicsMatch) {
    const items = topicsMatch[1].match(/["']([^"']+)["']/g);
    if (items) {
      metadata.topics = items.map(t => t.replace(/["']/g, ''));
    }
  }

  const requiresMatch = recipeContent.match(
    /requires\s*=\s*\[(.*?)\]/s,
  );
  if (requiresMatch) {
    const deps = requiresMatch[1].match(/["']([^"']+)["']/g);
    if (deps) {
      metadata.dependencies = deps.map(d => d.replace(/["']/g, ''));
    }
  }

  return metadata;
}

/**
 * Extract settings from conaninfo.txt inside a binary .tar.gz.
 * Ported from Django simple_upload.py extract_conaninfo().
 */
function extractConaninfo(buffer: Buffer): {
  os: string;
  arch: string;
  compiler: string;
  compiler_version: string;
  build_type: string;
} {
  const settings = {
    os: 'Linux',
    arch: 'x86_64',
    compiler: 'gcc',
    compiler_version: '11',
    build_type: 'Release',
  };

  try {
    // Decompress gzip, then parse tar to find conaninfo.txt
    const decompressed = zlib.gunzipSync(buffer);

    // Simple tar parsing - tar files have 512-byte blocks
    // Each file has a header block followed by data blocks
    let offset = 0;
    while (offset < decompressed.length - 512) {
      const header = decompressed.subarray(offset, offset + 512);

      // Check for empty block (end of archive)
      if (header.every(b => b === 0)) break;

      // Extract filename (bytes 0-99)
      const nameEnd = header.indexOf(0, 0);
      const name = header
        .subarray(0, Math.min(nameEnd, 100))
        .toString('utf-8');

      // Extract file size (bytes 124-135, octal)
      const sizeStr = header.subarray(124, 136).toString('utf-8').trim();
      const size = parseInt(sizeStr, 8) || 0;

      if (name.endsWith('conaninfo.txt') && size > 0) {
        const content = decompressed
          .subarray(offset + 512, offset + 512 + size)
          .toString('utf-8');

        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (trimmed.includes('=')) {
            const [key, value] = trimmed.split('=', 2);
            const k = key.trim();
            const v = value.trim();
            if (k === 'os') settings.os = v;
            else if (k === 'arch') settings.arch = v;
            else if (k === 'compiler') settings.compiler = v;
            else if (k === 'compiler.version') settings.compiler_version = v;
            else if (k === 'build_type') settings.build_type = v;
          }
        }
        break;
      }

      // Move to next file (header + data, padded to 512-byte boundary)
      offset += 512 + Math.ceil(size / 512) * 512;
    }
  } catch (err) {
    console.warn('Could not extract conaninfo.txt:', err);
  }

  return settings;
}

/** Routes for uploading packages */
export function createUploadRoutes(
  db: DatabaseService,
  storage: StorageProvider,
  docGen?: DocGenerationService,
): Router {
  const router = Router();

  // POST /package/upload - Unified upload endpoint
  // Ported from Django simple_upload.py upload_package()
  router.post(
    '/package/upload',
    upload.fields([
      { name: 'recipe', maxCount: 1 },
      { name: 'binary', maxCount: 1 },
      { name: 'rust_crate', maxCount: 1 },
      { name: 'readme', maxCount: 1 },
    ]),
    async (req: Request, res: Response) => {
      try {
        const files = req.files as {
          [fieldname: string]: Express.Multer.File[];
        };

        if (!files.recipe?.[0]) {
          res
            .status(400)
            .json({ status: 'error', message: 'Missing recipe file' });
          return;
        }
        if (!files.binary?.[0]) {
          res
            .status(400)
            .json({ status: 'error', message: 'Missing binary file' });
          return;
        }

        const recipeFile = files.recipe[0];
        const binaryFile = files.binary[0];
        const rustCrateFile = files.rust_crate?.[0];

        const recipeContent = recipeFile.buffer.toString('utf-8');
        const packageName = req.body.package_name;
        const version = req.body.version;

        if (!packageName || !version) {
          res.status(400).json({
            status: 'error',
            message: 'Missing required fields: package_name and version',
          });
          return;
        }

        // Parse conanfile for metadata
        const parsedMeta = parseConanfile(recipeContent);
        const conanSettings = extractConaninfo(binaryFile.buffer);

        // Entity ref for linking to catalog
        const entityRef = `component:default/${packageName}`;

        const conanVersion = req.body.conan_version || 'unknown';

        // Read readme from uploaded file field (if present)
        const readmeFile = files.readme?.[0];
        const readmeContent = readmeFile ? readmeFile.buffer.toString('utf-8') : '';

        // Upsert version with parsed metadata
        const pkgVersion = await db.upsertVersion(entityRef, version, {
          recipe_content: recipeContent,
          conan_version: conanVersion,
          uploaded_by: req.body.uploaded_by || null,
          description: parsedMeta.description,
          license: parsedMeta.license,
          author: parsedMeta.author,
          homepage: parsedMeta.homepage,
          topics: parsedMeta.topics.join(','),
          readme_content: readmeContent,
        });

        // Get or generate package_id
        let packageId = req.body.package_id;
        if (!packageId) {
          const idStr = `${conanSettings.os}-${conanSettings.arch}-${conanSettings.compiler}-${conanSettings.compiler_version}-${conanSettings.build_type}`;
          packageId = crypto
            .createHash('md5')
            .update(idStr)
            .digest('hex')
            .substring(0, 16);
        }

        // Parse dependency graph
        let dependencyGraph = {};
        if (req.body.dependency_graph) {
          try {
            dependencyGraph = JSON.parse(req.body.dependency_graph);
          } catch {
            console.warn('Could not parse dependency_graph JSON');
          }
        }

        // Calculate SHA256
        const sha256 = crypto
          .createHash('sha256')
          .update(binaryFile.buffer)
          .digest('hex');

        // Save binary file to storage
        const binaryKey = `${packageName}-${version}-${packageId}.tar.gz`;
        const binaryPath = await storage.save(
          'binaries',
          binaryKey,
          binaryFile.buffer,
        );

        // Save recipe to storage
        await storage.save(
          'recipes',
          `${packageName}-${version}-conanfile.py`,
          Buffer.from(recipeContent),
        );

        // Save rust crate if provided
        let rustCratePath = '';
        if (rustCrateFile) {
          const crateName = packageName.replace(/_/g, '-');
          rustCratePath = await storage.save(
            'rust_crates',
            `${crateName}-sys-${version}.crate`,
            rustCrateFile.buffer,
          );
        }

        // Upsert binary
        await db.upsertBinary(pkgVersion.id, packageId, {
          os: conanSettings.os,
          arch: conanSettings.arch,
          compiler: conanSettings.compiler,
          compiler_version: conanSettings.compiler_version,
          build_type: conanSettings.build_type,
          sha256,
          file_size: binaryFile.buffer.length,
          binary_file_path: binaryPath,
          rust_crate_file_path: rustCratePath,
          dependency_graph: dependencyGraph,
        });

        // Extract dependencies from the graph and store in dependencies table
        const graphData = dependencyGraph as {
          graph?: { nodes?: Record<string, { ref?: string; context?: string }> };
        };
        if (graphData?.graph?.nodes) {
          for (const [nodeId, node] of Object.entries(graphData.graph.nodes)) {
            if (nodeId === '0') continue; // skip root node
            if (node.ref) {
              const depName = node.ref.split('/')[0];
              // Strip recipe revision hash (e.g. "1.0.0#8f4cf6..." → "1.0.0")
              const depVersion = (node.ref.split('/')[1] || '').split('#')[0];
              if (depName && depName !== packageName) {
                const depEntityRef = `component:default/${depName}`;
                const depType = node.context === 'build' ? 'build_requires'
                  : node.context === 'test' ? 'test_requires'
                  : 'requires';
                await db.upsertDependency(
                  pkgVersion.id,
                  depEntityRef,
                  depType,
                  depVersion,
                );
              }
            }
          }
        }

        res.status(201).json({
          status: 'success',
          message: `Package ${packageName}/${version} uploaded successfully`,
          package: {
            name: packageName,
            version,
            package_id: packageId,
            sha256,
            size: binaryFile.buffer.length,
            settings: conanSettings,
            entity_ref: entityRef,
          },
        });

        // Trigger catalog refresh in background so the new package appears immediately
        triggerCatalogRefresh().catch(() => {});

        // Trigger API doc generation in background if not already done
        if (
          docGen &&
          (!pkgVersion.api_docs_status ||
            pkgVersion.api_docs_status === '' ||
            pkgVersion.api_docs_status === 'failed')
        ) {
          docGen
            .generateDocs({
              packageName,
              version,
              description: parsedMeta.description,
              license: parsedMeta.license,
              versionId: pkgVersion.id,
              binaryBuffer: Buffer.from(binaryFile.buffer),
              docsRootPath: storage.getRootPath(),
            })
            .catch(err2 => {
              console.error('Background doc generation failed:', err2);
            });
        }
      } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ status: 'error', message: String(err) });
      }
    },
  );

  return router;
}
