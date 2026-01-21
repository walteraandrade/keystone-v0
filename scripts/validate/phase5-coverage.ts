import { runValidation, fileExists, fileContains, type Check } from './runner.js';

const checks: Check[] = [
  {
    name: '5.1 CoverageQueryRegistry.ts exists',
    fn: () => fileExists('src/services/query/CoverageQueryRegistry.ts'),
  },
  {
    name: '5.2 risksWithoutControls query method exists',
    fn: () => fileContains('src/services/query/CoverageQueryRegistry.ts', /risksWithoutControls/),
  },
  {
    name: '5.3 controlsWithoutSteps query method exists',
    fn: () => fileContains('src/services/query/CoverageQueryRegistry.ts', /controlsWithoutSteps/),
  },
  {
    name: '5.4 unmitigatedHighRpn query method exists',
    fn: () => fileContains('src/services/query/CoverageQueryRegistry.ts', /unmitigatedHighRpn/),
  },
  {
    name: '5.5 coverage.schema.ts exists',
    fn: () => fileExists('src/api/schemas/coverage.schema.ts'),
  },
  {
    name: '5.6 coverage.handler.ts exists',
    fn: () => fileExists('src/api/handlers/coverage.handler.ts'),
  },
  {
    name: '5.7 GET /coverage route referenced',
    fn: () => fileContains('src/api/handlers/coverage.handler.ts', /coverage/) ||
           fileContains('src/index.ts', /coverage/i),
  },
  {
    name: '5.8 CoverageQueryRegistry wired in src/index.ts',
    fn: () => fileContains('src/index.ts', /CoverageQueryRegistry|coverageQuery/i),
  },
];

runValidation(checks);
