#!/usr/bin/env bun
import { readFileSync, existsSync } from 'fs';
import { ChunkingEvaluator } from './index.js';
import { ProgressReporter } from './reporters/ProgressReporter.js';
import { logger } from '../../utils/logger.js';

interface CliArgs {
  doc?: string;
  file?: string;
  type?: string;
  topK?: number;
  questions?: number;
  format?: 'table' | 'json';
  generateOnly?: boolean;
  skipFixed?: boolean;
  help?: boolean;
}

const HELP = `
Chunking Evaluation Skill - Compare semantic vs fixed-size chunking

Usage:
  bun run eval-chunking --doc <documentId> [options]
  bun run eval-chunking --file <path> --type <fmea|ipar|generic> [options]

Options:
  --doc <id>          Document ID (fetches content from vector store)
  --file <path>       Path to document file (alternative to --doc)
  --type <type>       Document type: fmea, ipar, or generic (required with --file)
  --top-k <n>         Number of chunks to retrieve per question (default: 5)
  --questions <n>     Number of golden questions to generate (default: 20)
  --format <fmt>      Output format: table or json (default: table)
  --generate-only     Only generate golden questions, skip evaluation
  --skip-fixed        Skip fixed-size baseline, evaluate semantic only
  --help              Show this help message

Examples:
  bun run eval-chunking --doc doc-123
  bun run eval-chunking --file ./data/fmea-report.txt --type fmea
  bun run eval-chunking --doc doc-123 --format json --top-k 3
  bun run eval-chunking --file ./report.txt --type ipar --generate-only
`;

const parseArgs = (): CliArgs => {
  const args: CliArgs = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--doc':
        args.doc = argv[++i];
        break;
      case '--file':
        args.file = argv[++i];
        break;
      case '--type':
        args.type = argv[++i];
        break;
      case '--top-k':
        args.topK = parseInt(argv[++i], 10);
        break;
      case '--questions':
        args.questions = parseInt(argv[++i], 10);
        break;
      case '--format':
        args.format = argv[++i] as 'table' | 'json';
        break;
      case '--generate-only':
        args.generateOnly = true;
        break;
      case '--skip-fixed':
        args.skipFixed = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
    }
  }

  return args;
};

const loadDocument = async (
  args: CliArgs,
  evaluator: ChunkingEvaluator
): Promise<{ documentId: string; content: string; documentType: string }> => {
  if (args.file) {
    if (!args.type) {
      throw new Error('--type is required when using --file');
    }
    if (!existsSync(args.file)) {
      throw new Error(`File not found: ${args.file}`);
    }

    const content = readFileSync(args.file, 'utf-8');
    const documentId = args.file.replace(/[^a-zA-Z0-9]/g, '-');

    return { documentId, content, documentType: args.type };
  }

  if (args.doc) {
    // For document ID, we need to retrieve content from vector store
    // This requires the document to already be ingested
    // We'll concatenate all chunks to reconstruct the content
    const chunks: string[] = [];
    let documentType = 'generic';

    // Access the internal vector store through the evaluator
    // This is a workaround; in production, you'd have a document storage service
    await (evaluator as any).vectorStore.scrollAll((chunk: any) => {
      if (chunk.payload.documentId === args.doc) {
        chunks.push(chunk.payload.chunkText);
        if (chunk.payload.metadata?.documentType) {
          documentType = chunk.payload.metadata.documentType;
        }
      }
    });

    if (chunks.length === 0) {
      throw new Error(`No chunks found for document: ${args.doc}. Has it been ingested?`);
    }

    const content = chunks.join('\n\n---\n\n');
    return { documentId: args.doc, content, documentType };
  }

  throw new Error('Either --doc or --file must be provided');
};

const main = async (): Promise<void> => {
  const args = parseArgs();

  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }

  if (!args.doc && !args.file) {
    console.error('Error: Either --doc or --file must be provided');
    console.log(HELP);
    process.exit(1);
  }

    const evaluator = new ChunkingEvaluator('./data/eval-chunking.db', {
      topK: args.topK,
      questionCount: args.questions,
    });

    const progressReporter = new ProgressReporter(process.stdout.isTTY && args.format !== 'json');

    try {
      await evaluator.initialize();

      const { documentId, content, documentType } = await loadDocument(args, evaluator);

      logger.info(
        { documentId, documentType, contentLength: content.length },
        'Starting chunking evaluation'
      );

      await evaluator.evaluate({
        documentId,
        content,
        documentType,
        generateOnly: args.generateOnly,
        skipFixed: args.skipFixed,
        format: args.format || 'table',
        progressReporter,
      });
  } catch (error) {
    logger.error({ error }, 'Evaluation failed');
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await evaluator.close();
  }
};

main();
