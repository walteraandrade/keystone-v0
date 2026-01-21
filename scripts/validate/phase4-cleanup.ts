import { runValidation, fileExists, fileContains, type Check } from './runner.js';

const checks: Check[] = [
  {
    name: '4.1 deleteFailedDocumentsOlderThan method in Neo4jRepository',
    fn: () => fileContains('src/services/graph/Neo4jRepository.ts', /deleteFailedDocumentsOlderThan/),
  },
  {
    name: '4.2 CleanupService.ts exists',
    fn: () => fileExists('src/services/ingestion/CleanupService.ts'),
  },
  {
    name: '4.3 cleanup config exists',
    fn: () => fileContains('src/config/index.ts', /cleanup/),
  },
  {
    name: '4.4 admin.handler.ts exists',
    fn: () => fileExists('src/api/handlers/admin.handler.ts'),
  },
  {
    name: '4.5 POST /admin/cleanup route registered',
    fn: () => fileContains('src/api/handlers/admin.handler.ts', /cleanup/) ||
           fileContains('src/index.ts', /admin.*cleanup|cleanup.*admin/i),
  },
  {
    name: '4.6 startup cleanup wired in src/index.ts',
    fn: () => fileContains('src/index.ts', /CleanupService|cleanupService|startup.*cleanup|cleanup.*startup/i),
  },
  {
    name: '4.7 endpoint handler defined',
    fn: () => fileContains('src/api/handlers/admin.handler.ts', /handler|Handler/),
  },
];

runValidation(checks);
