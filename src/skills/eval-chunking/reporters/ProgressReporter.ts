const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
};

const fmt = (color: keyof typeof COLORS, text: string): string =>
  `${COLORS[color]}${text}${COLORS.reset}`;

export interface ProgressStep {
  current: number;
  total: number;
  message: string;
  substeps?: Array<{ current: number; total: number; message: string }>;
}

export class ProgressReporter {
  private enabled: boolean;
  private lastLineLength: number = 0;

  constructor(enabled: boolean = true) {
    this.enabled = enabled && process.stdout.isTTY;
  }

  step(step: ProgressStep): void {
    if (!this.enabled) return;

    this.clearLine();
    const stepMsg = fmt('cyan', `[${step.current}/${step.total}]`) + ` ${step.message}`;
    console.log(stepMsg);
    this.lastLineLength = stepMsg.length;

    if (step.substeps) {
      for (const substep of step.substeps) {
        const substepMsg = `  ${this.getSubstepPrefix(substep.current, substep.total)} ${substep.message}`;
        console.log(fmt('dim', substepMsg));
        this.lastLineLength = substepMsg.length;
      }
    }
  }

  updateSubstep(stepNum: number, totalSteps: number, substep: { current: number; total: number; message: string }): void {
    if (!this.enabled) return;

    this.clearLine();
    const stepMsg = fmt('cyan', `[${stepNum}/${totalSteps}]`) + ` (in progress)`;
    console.log(stepMsg);
    const substepMsg = `  ${this.getSubstepPrefix(substep.current, substep.total)} ${substep.message}`;
    console.log(fmt('dim', substepMsg));
    this.lastLineLength = substepMsg.length;
  }

  complete(message: string): void {
    if (!this.enabled) return;
    this.clearLine();
    console.log(fmt('green', '✓') + ` ${message}`);
    this.lastLineLength = 0;
  }

  private getSubstepPrefix(current: number, total: number): string {
    if (current === total) return '└──';
    return '├──';
  }

  private clearLine(): void {
    if (this.lastLineLength > 0) {
      process.stdout.write('\r' + ' '.repeat(this.lastLineLength) + '\r');
      this.lastLineLength = 0;
    }
  }
}


