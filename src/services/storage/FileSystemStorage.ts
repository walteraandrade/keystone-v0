import { createHash } from 'crypto';
import { mkdir, writeFile, readFile, unlink, access } from 'fs/promises';
import { join } from 'path';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { DocumentStorageError } from '../../utils/errors.js';
import type { DocumentStorage, StoredDocument } from './DocumentStorage.interface.js';

export class FileSystemStorage implements DocumentStorage {
  private basePath: string;

  constructor() {
    this.basePath = config.storage.documentPath;
  }

  async init(): Promise<void> {
    try {
      await mkdir(this.basePath, { recursive: true });
      logger.info({ path: this.basePath }, 'Document storage initialized');
    } catch (error) {
      logger.error({ error, path: this.basePath }, 'Failed to initialize storage');
      throw new DocumentStorageError('Storage initialization failed', error);
    }
  }

  async store(fileName: string, content: Buffer): Promise<StoredDocument> {
    try {
      const hash = createHash('sha256').update(new Uint8Array(content)).digest('hex');
      const timestamp = Date.now();
      const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = join(this.basePath, `${timestamp}_${hash.substring(0, 8)}_${sanitizedName}`);

      await writeFile(storagePath, new Uint8Array(content));

      logger.debug({ fileName, path: storagePath, size: content.length }, 'Document stored');

      return {
        path: storagePath,
        hash,
        size: content.length,
      };
    } catch (error) {
      logger.error({ error, fileName }, 'Failed to store document');
      throw new DocumentStorageError('Document storage failed', error);
    }
  }

  async retrieve(path: string): Promise<Buffer> {
    try {
      const content = await readFile(path);
      logger.debug({ path, size: content.length }, 'Document retrieved');
      return content;
    } catch (error) {
      logger.error({ error, path }, 'Failed to retrieve document');
      throw new DocumentStorageError('Document retrieval failed', error);
    }
  }

  async delete(path: string): Promise<void> {
    try {
      await unlink(path);
      logger.debug({ path }, 'Document deleted');
    } catch (error) {
      logger.error({ error, path }, 'Failed to delete document');
      throw new DocumentStorageError('Document deletion failed', error);
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }
}
