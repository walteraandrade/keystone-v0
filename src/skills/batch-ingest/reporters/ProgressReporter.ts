import type { BatchProgress } from '../types.js';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

const fmt = (color: keyof typeof COLORS, text: string): string =>
  `${COLORS[color]}${text}${COLORS.reset}`;

const PHASE_LABELS: Record<BatchProgress['phase'], string> = {
  scanning: 'Scanning folder',
  classifying: 'Classifying documents',
  checking: 'Checking existing',
  ingesting: 'Ingesting documents',
};

export class ProgressReporter {
  private enabled: boolean;
  private lastLineLength: number = 0;

  constructor(enabled: boolean = true) {
    this.enabled = enabled && process.stdout.isTTY;
  }

  update(progress: BatchProgress): void {
    if (!this.enabled) return;

    this.clearLine();
    const phase = fmt('cyan', `[${progress.current}/${progress.total}]`);
    const label = PHASE_LABELS[progress.phase];
    const file = progress.currentFile ? fmt('dim', ` - ${progress.currentFile}`) : '';
    const line = `${phase} ${label}${file}`;
    process.stdout.write(line);
    this.lastLineLength = line.length;
  }

  complete(message: string): void {
    if (!this.enabled) return;
    this.clearLine();
    console.log(fmt('green', '✓') + ` ${message}`);
    this.lastLineLength = 0;
  }

  warn(message: string): void {
    if (!this.enabled) return;
    this.clearLine();
    console.log(fmt('yellow', '⚠') + ` ${message}`);
    this.lastLineLength = 0;
  }

  error(message: string): void {
    this.clearLine();
    console.log(fmt('red', '✗') + ` ${message}`);
    this.lastLineLength = 0;
  }

  private clearLine(): void {
    if (this.lastLineLength > 0) {
      process.stdout.write('\r' + ' '.repeat(this.lastLineLength) + '\r');
      this.lastLineLength = 0;
    }
  }
}
