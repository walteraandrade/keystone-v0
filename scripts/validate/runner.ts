import { existsSync, readFileSync } from 'fs';
import { spawnSync } from 'bun';

export interface Check {
  name: string;
  fn: () => boolean | Promise<boolean>;
}

export const fileExists = (path: string): boolean => existsSync(path);

export const fileContains = (path: string, pattern: RegExp): boolean => {
  if (!existsSync(path)) return false;
  const content = readFileSync(path, 'utf-8');
  return pattern.test(content);
};

export const fileContainsAll = (path: string, patterns: RegExp[]): boolean => {
  if (!existsSync(path)) return false;
  const content = readFileSync(path, 'utf-8');
  return patterns.every(p => p.test(content));
};

export const runCommand = (cmd: string, args: string[] = []): boolean => {
  const result = spawnSync([cmd, ...args], { stdout: 'pipe', stderr: 'pipe' });
  return result.exitCode === 0;
};

export const runValidation = async (checks: Check[]): Promise<void> => {
  let passed = 0;
  let failed = 0;

  for (const check of checks) {
    try {
      const result = await check.fn();
      if (result) {
        console.log(`✓ ${check.name}`);
        passed++;
      } else {
        console.log(`✗ ${check.name}`);
        failed++;
      }
    } catch (err) {
      console.log(`✗ ${check.name} (error: ${err})`);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
};
