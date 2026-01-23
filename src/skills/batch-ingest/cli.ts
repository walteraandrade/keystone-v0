#!/usr/bin/env bun
import { BatchIngestor } from './index.js';
import { ProgressReporter } from './reporters/ProgressReporter.js';
import { logger } from '../../utils/logger.js';
import type { BatchConfig } from './types.js';

interface CliArgs {
  folder?: string;
  dryRun?: boolean;
  format?: 'table' | 'json';
  concurrency?: number;
  noSkip?: boolean;
  help?: boolean;
}

const HELP = `
Batch Document Ingestion - Classify and ingest documents from folders

Usage:
  bun run batch-ingest --folder <path> [options]

Options:
  --folder <path>      Path to folder containing documents (required)
  --dry-run            Preview classifications without ingesting
  --format <fmt>       Output format: table or json (default: table)
  --concurrency <n>    Max concurrent ingestions (default: 2)
  --no-skip            Re-ingest even if document exists (by contentHash)
  --help               Show this help message

Examples:
  bun run batch-ingest --folder ./FPS --dry-run
  bun run batch-ingest --folder ./FPS
  bun run batch-ingest --folder ./FPS --format json
  bun run batch-ingest --folder ./FPS --concurrency 4
`;

const parseArgs = (): CliArgs => {
  const args: CliArgs = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--folder':
        args.folder = argv[++i];
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--format':
        args.format = argv[++i] as 'table' | 'json';
        break;
      case '--concurrency':
        args.concurrency = parseInt(argv[++i], 10);
        break;
      case '--no-skip':
        args.noSkip = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
    }
  }

  return args;
};

const printTable = (files: Array<{ name: string; classification: { documentType: string; confidence: number; method: string }; skip?: boolean; skipReason?: string }>) => {
  const maxName = Math.max(20, ...files.map(f => f.name.length));
  const header = `${'File'.padEnd(maxName)} | Type      | Conf  | Method  | Skip`;
  const separator = '-'.repeat(header.length);

  console.log(separator);
  console.log(header);
  console.log(separator);

  for (const file of files) {
    const { classification, skip, skipReason } = file;
    const skipStr = skip ? `Yes (${skipReason})` : 'No';
    console.log(
      `${file.name.padEnd(maxName)} | ${classification.documentType.padEnd(9)} | ${classification.confidence.toFixed(2)}  | ${classification.method.padEnd(7)} | ${skipStr}`
    );
  }
  console.log(separator);
};

const printSummary = (result: { summary: { total: number; processed: number; skipped: number; failed: number; byType: Record<string, number> } }) => {
  const { summary } = result;
  console.log('\nSummary:');
  console.log(`  Total:     ${summary.total}`);
  console.log(`  Processed: ${summary.processed}`);
  console.log(`  Skipped:   ${summary.skipped}`);
  console.log(`  Failed:    ${summary.failed}`);
  console.log('\nBy Type:');
  for (const [type, count] of Object.entries(summary.byType)) {
    console.log(`  ${type}: ${count}`);
  }
};

const main = async (): Promise<void> => {
  const args = parseArgs();

  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }

  if (!args.folder) {
    console.error('Error: --folder is required');
    console.log(HELP);
    process.exit(1);
  }

  const config: BatchConfig = {
    folder: args.folder,
    dryRun: args.dryRun ?? false,
    format: args.format ?? 'table',
    concurrency: args.concurrency ?? 2,
    skipExisting: !args.noSkip,
  };

  const progressReporter = new ProgressReporter(process.stdout.isTTY && config.format !== 'json');
  const ingestor = new BatchIngestor();

  try {
    await ingestor.initialize();

    logger.info({ folder: config.folder, dryRun: config.dryRun }, 'Starting batch ingestion');

    const result = await ingestor.run(config, progressReporter);

    if (config.format === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`\nClassification Results (${result.files.length} files):\n`);
      printTable(result.files);

      if (!config.dryRun) {
        printSummary(result);
      }
    }
  } catch (error) {
    logger.error({ error }, 'Batch ingestion failed');
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await ingestor.close();
  }
};

main();
