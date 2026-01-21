import { runValidation, fileExists, fileContains, fileContainsAll, runCommand, type Check } from './runner.js';

const checks: Check[] = [
  {
    name: '1.1 ProcedureStep.ts exists',
    fn: () => fileExists('src/domain/entities/ProcedureStep.ts'),
  },
  {
    name: '1.2 ProcedureStep exported in entities/index.ts and in union type',
    fn: () => fileContainsAll('src/domain/entities/index.ts', [
      /export.*ProcedureStep/,
      /ProcedureStep.*Entity|Entity.*ProcedureStep/,
    ]),
  },
  {
    name: '1.3 IMPLEMENTS and APPLIED_IN in relationships/types.ts',
    fn: () => fileContainsAll('src/domain/relationships/types.ts', [
      /IMPLEMENTS/,
      /APPLIED_IN/,
    ]),
  },
  {
    name: '1.4 RelationshipStatus type exists',
    fn: () => fileContains('src/domain/relationships/types.ts', /RelationshipStatus/),
  },
  {
    name: '1.5 ProcedureStep rules in relationships/validation.ts',
    fn: () => fileContains('src/domain/relationships/validation.ts', /ProcedureStep/),
  },
  {
    name: '1.6 bun run build passes',
    fn: () => runCommand('bun', ['run', 'build']),
  },
];

runValidation(checks);
