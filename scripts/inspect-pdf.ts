#!/usr/bin/env bun
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

interface CliArgs {
  file?: string;
  output?: string;
  help?: boolean;
}

const SAFETY_KEYWORDS = [
  'objetivo', 'escopo', 'definições', 'responsabilidades', 'procedimentos',
  'risco', 'perigo', 'controle', 'mitigação', 'isolamento', 'lockout',
  'tagout', 'energia', 'elétrica', 'altura', 'confinado', 'espaço',
  'içamento', 'veículo', 'terceiros', 'auditoria', 'emergência',
  'métrica', 'investigação', 'acidente', 'hira', 'segurança',
];

const SECTION_PATTERNS = [
  /^\d+\.\d*\s+[A-ZÁÊÔ]/,
  /^[A-ZÁÊÔ][a-záêô]+\s*:/,
  /^[A-ZÁÊÔ\s]{3,}$/,
  /^[IVX]+\.\s+[A-Z]/,
];

function parseArgs(): CliArgs {
  const args: CliArgs = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--file':
      case '-f':
        args.file = argv[++i];
        break;
      case '--output':
      case '-o':
        args.output = argv[++i];
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        if (!args.file && !arg.startsWith('-')) {
          args.file = arg;
        }
        break;
    }
  }

  return args;
}

function detectSections(content: string): Array<{ heading: string; line: number; level: number }> {
  const lines = content.split('\n');
  const sections: Array<{ heading: string; line: number; level: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length < 3) continue;

    for (const pattern of SECTION_PATTERNS) {
      if (pattern.test(line)) {
        const level = detectLevel(line);
        sections.push({ heading: line, line: i + 1, level });
        break;
      }
    }

    const numberedMatch = line.match(/^(\d+)\.(\d*)\s+(.+)$/);
    if (numberedMatch) {
      const level = numberedMatch[2] ? 2 : 1;
      sections.push({ heading: numberedMatch[3], line: i + 1, level });
    }
  }

  return sections;
}

function detectLevel(line: string): number {
  if (/^\d+\.\d+\./.test(line)) return 3;
  if (/^\d+\.\d+/.test(line)) return 2;
  if (/^\d+\./.test(line)) return 1;
  if (/^[A-ZÁÊÔ\s]{5,}$/.test(line)) return 1;
  return 2;
}

function findKeywords(content: string): Map<string, number> {
  const lower = content.toLowerCase();
  const found = new Map<string, number>();

  for (const keyword of SAFETY_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\w*\\b`, 'gi');
    const matches = lower.match(regex);
    if (matches) {
      found.set(keyword, matches.length);
    }
  }

  return found;
}

async function inspectPDF(filePath: string): Promise<string> {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const buffer = await readFile(filePath);
  const data = await pdfParse(buffer);

  const lines = data.text.split('\n');
  const sections = detectSections(data.text);
  const keywords = findKeywords(data.text);

  const analysis = [
    '='.repeat(80),
    `PDF Analysis: ${filePath}`,
    '='.repeat(80),
    '',
    `Pages: ${data.numpages}`,
    `Total Lines: ${lines.length}`,
    `Total Characters: ${data.text.length}`,
    `Sections Detected: ${sections.length}`,
    '',
    '--- Section Structure ---',
    '',
  ];

  if (sections.length > 0) {
    for (const section of sections.slice(0, 20)) {
      analysis.push(`Line ${section.line.toString().padStart(4)} [Level ${section.level}]: ${section.heading.substring(0, 70)}`);
    }
    if (sections.length > 20) {
      analysis.push(`... and ${sections.length - 20} more sections`);
    }
  } else {
    analysis.push('No structured sections detected');
  }

  analysis.push('');
  analysis.push('--- Safety Keywords Found ---');
  analysis.push('');

  if (keywords.size > 0) {
    const sorted = Array.from(keywords.entries()).sort((a, b) => b[1] - a[1]);
    for (const [keyword, count] of sorted) {
      analysis.push(`  ${keyword.padEnd(20)} : ${count} occurrences`);
    }
  } else {
    analysis.push('No safety keywords detected');
  }

  analysis.push('');
  analysis.push('='.repeat(80));
  analysis.push('RAW TEXT EXTRACT');
  analysis.push('='.repeat(80));
  analysis.push('');
  analysis.push(data.text);

  return analysis.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help || !args.file) {
    console.log(`
PDF Inspection Tool

Usage:
  bun run scripts/inspect-pdf.ts <file> [--output <output.txt>]
  bun run scripts/inspect-pdf.ts --file <file> [--output <output.txt>]

Options:
  --file, -f     PDF file path (required)
  --output, -o   Output file path (optional, defaults to stdout)
  --help, -h     Show this help

Examples:
  bun run scripts/inspect-pdf.ts FPS/01.AM_Safety_ST_001.pdf
  bun run scripts/inspect-pdf.ts FPS/01.AM_Safety_ST_001.pdf --output analysis.txt
`);
    process.exit(args.help ? 0 : 1);
  }

  try {
    const analysis = await inspectPDF(args.file);

    if (args.output) {
      await writeFile(args.output, analysis, 'utf-8');
      console.log(`Analysis written to: ${args.output}`);
    } else {
      console.log(analysis);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();

