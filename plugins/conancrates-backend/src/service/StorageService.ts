import { Config } from '@backstage/config';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

/** Abstract storage interface for package files */
export interface StorageProvider {
  save(bucket: string, key: string, data: Buffer | Readable): Promise<string>;
  read(bucket: string, key: string): Promise<Buffer>;
  readStream(bucket: string, key: string): Promise<Readable>;
  delete(bucket: string, key: string): Promise<void>;
  exists(bucket: string, key: string): Promise<boolean>;
}

/** Local filesystem storage for development */
export class LocalStorageProvider implements StorageProvider {
  private readonly rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  private resolvePath(bucket: string, key: string): string {
    const resolved = path.resolve(this.rootPath, bucket, key);
    // Prevent path traversal
    if (!resolved.startsWith(path.resolve(this.rootPath))) {
      throw new Error('Invalid storage path');
    }
    return resolved;
  }

  async save(
    bucket: string,
    key: string,
    data: Buffer | Readable,
  ): Promise<string> {
    const filePath = this.resolvePath(bucket, key);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });

    if (Buffer.isBuffer(data)) {
      await fs.promises.writeFile(filePath, data);
    } else {
      const writeStream = fs.createWriteStream(filePath);
      await new Promise<void>((resolve, reject) => {
        data.pipe(writeStream);
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        data.on('error', reject);
      });
    }

    return `${bucket}/${key}`;
  }

  async read(bucket: string, key: string): Promise<Buffer> {
    const filePath = this.resolvePath(bucket, key);
    return fs.promises.readFile(filePath);
  }

  async readStream(bucket: string, key: string): Promise<Readable> {
    const filePath = this.resolvePath(bucket, key);
    return fs.createReadStream(filePath);
  }

  async delete(bucket: string, key: string): Promise<void> {
    const filePath = this.resolvePath(bucket, key);
    try {
      await fs.promises.unlink(filePath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    const filePath = this.resolvePath(bucket, key);
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

/** Create a StorageProvider from Backstage config */
export function createStorageProvider(config: Config): StorageProvider {
  const storageConfig = config.getOptionalConfig('conancrates.storage');
  const type = storageConfig?.getOptionalString('type') ?? 'local';

  if (type === 'local') {
    const rootPath =
      storageConfig?.getOptionalString('local.rootPath') ?? './data/uploads';
    return new LocalStorageProvider(path.resolve(rootPath));
  }

  // TODO: S3StorageProvider for s3/minio
  // TODO: ArtifactoryStorageProvider for artifactory
  throw new Error(`Unsupported storage type: ${type}`);
}
