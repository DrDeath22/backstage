import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as zlib from 'zlib';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { DatabaseService } from './DatabaseService';

const execFileAsync = promisify(execFile);

const HEADER_EXTENSIONS = ['.h', '.hpp', '.hxx', '.hh', '.H'];

export interface DocGenerationOptions {
  packageName: string;
  version: string;
  description: string;
  license: string;
  versionId: number;
  binaryBuffer: Buffer;
  docsRootPath: string;
}

export class DocGenerationService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly logger: any;

  constructor(
    private readonly db: DatabaseService,
    private readonly docsRootPath: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logger?: any,
  ) {
    this.logger = logger || console;
  }

  /**
   * Generate API docs in the background. Does not throw —
   * updates DB status on success or failure.
   */
  async generateDocs(opts: DocGenerationOptions): Promise<void> {
    await this.db.updateDocsStatus(opts.versionId, 'generating', '', '');

    let tempDir: string | undefined;
    try {
      tempDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), 'conancrates-docs-'),
      );

      const headerCount = await this.extractHeaders(
        opts.binaryBuffer,
        tempDir,
      );

      if (headerCount === 0) {
        this.logger.info(
          `No headers found for ${opts.packageName}/${opts.version}, skipping doc generation`,
        );
        await this.db.updateDocsStatus(
          opts.versionId,
          'no_headers',
          '',
          '',
        );
        return;
      }

      this.logger.info(
        `Extracted ${headerCount} header files for ${opts.packageName}/${opts.version}, generating docs...`,
      );

      // Write poxy.toml config
      const poxyConfig = this.generatePoxyConfig(opts);
      await fs.promises.writeFile(
        path.join(tempDir, 'poxy.toml'),
        poxyConfig,
      );

      // Run poxy
      try {
        await execFileAsync('poxy', [path.join(tempDir, 'poxy.toml')], {
          cwd: tempDir,
          timeout: 120_000,
        });
      } catch (poxyErr) {
        // poxy might not be installed — try doxygen directly as fallback
        this.logger.warn(
          'poxy failed, trying doxygen directly:',
          poxyErr instanceof Error ? poxyErr.message : String(poxyErr),
        );
        await this.runDoxygenFallback(tempDir, opts);
      }

      // Find the output directory (poxy -> html/, doxygen -> html/)
      const outputDir = path.join(tempDir, 'html');
      const outputExists = await fs.promises
        .access(outputDir)
        .then(() => true)
        .catch(() => false);

      if (!outputExists) {
        throw new Error(
          'No html/ output directory found after doc generation',
        );
      }

      // Copy output to permanent storage
      const docsKey = `${opts.packageName}-${opts.version}`;
      const destDir = path.join(this.docsRootPath, 'api_docs', docsKey);

      // Remove old docs if they exist
      await fs.promises
        .rm(destDir, { recursive: true, force: true })
        .catch(() => {});
      await fs.promises.mkdir(destDir, { recursive: true });
      await this.copyDir(outputDir, destDir);

      const docsPath = `api_docs/${docsKey}`;
      await this.db.updateDocsStatus(opts.versionId, 'ready', docsPath, '');

      this.logger.info(
        `API docs generated for ${opts.packageName}/${opts.version}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Doc generation failed for ${opts.packageName}/${opts.version}: ${message}`,
      );
      await this.db.updateDocsStatus(
        opts.versionId,
        'failed',
        '',
        message,
      );
    } finally {
      if (tempDir) {
        await fs.promises
          .rm(tempDir, { recursive: true, force: true })
          .catch(() => {});
      }
    }
  }

  /**
   * Extract header files from a binary tarball buffer into tempDir/include/.
   * Returns the number of header files extracted.
   */
  private async extractHeaders(
    buffer: Buffer,
    tempDir: string,
  ): Promise<number> {
    const includeDir = path.join(tempDir, 'include');
    await fs.promises.mkdir(includeDir, { recursive: true });

    let headerCount = 0;

    try {
      const decompressed = zlib.gunzipSync(buffer);

      let offset = 0;
      while (offset < decompressed.length - 512) {
        const header = decompressed.subarray(offset, offset + 512);

        // Empty block = end of archive
        if (header.every(b => b === 0)) break;

        // Extract filename (bytes 0-99)
        const nameEnd = header.indexOf(0, 0);
        const name = header
          .subarray(0, Math.min(nameEnd, 100))
          .toString('utf-8');

        // Extract file size (bytes 124-135, octal)
        const sizeStr = header.subarray(124, 136).toString('utf-8').trim();
        const size = parseInt(sizeStr, 8) || 0;

        // Check if this is a header file
        const ext = path.extname(name).toLowerCase();
        const isHeader = HEADER_EXTENSIONS.includes(ext);
        // Also match files in include/ directories regardless of extension
        const inInclude =
          name.includes('/include/') || name.startsWith('include/');

        if (isHeader && size > 0) {
          const content = decompressed.subarray(
            offset + 512,
            offset + 512 + size,
          );

          // Determine relative path — strip leading path up to and including 'include/'
          let relPath: string;
          const includeIdx = name.indexOf('/include/');
          if (includeIdx >= 0) {
            relPath = name.substring(includeIdx + '/include/'.length);
          } else if (name.startsWith('include/')) {
            relPath = name.substring('include/'.length);
          } else {
            relPath = path.basename(name);
          }

          const destPath = path.join(includeDir, relPath);
          await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
          await fs.promises.writeFile(destPath, content);
          headerCount++;
        } else if (inInclude && isHeader && size === 0) {
          // Directory entry, skip
        }

        // Move to next file (header + data, padded to 512-byte boundary)
        offset += 512 + Math.ceil(size / 512) * 512;
      }
    } catch (err) {
      this.logger.warn('Could not extract headers from tarball:', err);
    }

    return headerCount;
  }

  /**
   * Generate poxy.toml config content.
   */
  private generatePoxyConfig(opts: DocGenerationOptions): string {
    const safeName = opts.packageName.replace(/'/g, "\\'");
    const safeDesc = (opts.description || `${opts.packageName} C++ library`).replace(/'/g, "\\'");
    const safeLicense = (opts.license || 'Unknown').replace(/'/g, "\\'");

    return `[poxy]
name = '${safeName}'
description = '${safeDesc}'
cpp = 20
github = ''
license = ['${safeLicense}']
show_includes = true

[poxy.sources]
paths = ['include']
patterns = ['*.h', '*.hpp', '*.hxx', '*.hh', '*.H']
recursive = true

[poxy.warnings]
enabled = false
treat_as_errors = false
`;
  }

  /**
   * Fallback: run doxygen directly if poxy is not available.
   * Generates a Doxyfile and runs doxygen on it.
   */
  private async runDoxygenFallback(
    tempDir: string,
    opts: DocGenerationOptions,
  ): Promise<void> {
    const doxyfile = `
PROJECT_NAME           = "${opts.packageName}"
PROJECT_NUMBER         = "${opts.version}"
PROJECT_BRIEF          = "${opts.description || ''}"
OUTPUT_DIRECTORY       = "${tempDir}"
INPUT                  = "${path.join(tempDir, 'include')}"
RECURSIVE              = YES
FILE_PATTERNS          = *.h *.hpp *.hxx *.hh
GENERATE_HTML          = YES
GENERATE_LATEX         = NO
HTML_OUTPUT            = html
EXTRACT_ALL            = YES
EXTRACT_PRIVATE        = NO
EXTRACT_STATIC         = YES
QUIET                  = YES
WARNINGS               = NO
`.trim();

    const doxyfilePath = path.join(tempDir, 'Doxyfile');
    await fs.promises.writeFile(doxyfilePath, doxyfile);

    await execFileAsync('doxygen', [doxyfilePath], {
      cwd: tempDir,
      timeout: 120_000,
    });
  }

  /**
   * Recursively copy a directory.
   */
  private async copyDir(src: string, dest: string): Promise<void> {
    const entries = await fs.promises.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await fs.promises.mkdir(destPath, { recursive: true });
        await this.copyDir(srcPath, destPath);
      } else {
        await fs.promises.copyFile(srcPath, destPath);
      }
    }
  }
}
