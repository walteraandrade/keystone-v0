import { runValidation, fileExists, fileContains, runCommand, type Check } from './runner.js';

const checks: Check[] = [
  {
    name: '3.1 BunSQLiteService.ts exists',
    fn: () => fileExists('src/services/extraction/BunSQLiteService.ts'),
  },
  {
    name: '3.2 extractionLog config in validation.ts',
    fn: () => fileContains('src/config/validation.ts', /extractionLog/),
  },
  {
    name: '3.3 extractionLog config in config/index.ts',
    fn: () => fileContains('src/config/index.ts', /extractionLog/),
  },
  {
    name: '3.4 .env.example has EXTRACTION_LOG vars',
    fn: () => fileContains('.env.example', /EXTRACTION_LOG/),
  },
  {
    name: '3.5 BunSQLiteService wired in IngestionOrchestrator',
    fn: () => fileContains('src/services/ingestion/IngestionOrchestrator.ts', /BunSQLiteService|extractionLog|sqliteService/i),
  },
  {
    name: '3.6 BunSQLiteService wired in src/index.ts',
    fn: () => fileContains('src/index.ts', /BunSQLiteService|extractionLog|sqliteService/i),
  },
  {
    name: '3.7 Service has log() method',
    fn: () => fileContains('src/services/extraction/BunSQLiteService.ts', /log\s*\(/),
  },
];

runValidation(checks);
