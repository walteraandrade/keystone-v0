import { logger } from '../../utils/logger.js';
import type { GraphRepository } from '../graph/GraphRepository.interface.js';

export class CleanupService {
  constructor(private graphRepo: GraphRepository) {}

  async cleanupFailedDocuments(olderThanHours: number = 24): Promise<number> {
    logger.info({ olderThanHours }, 'Starting cleanup of failed documents');
    const deleted = await this.graphRepo.deleteFailedDocumentsOlderThan(olderThanHours);
    logger.info({ deleted }, 'Cleanup complete');
    return deleted;
  }
}
