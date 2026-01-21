import { runValidation, fileContains, fileContainsAll, runCommand, type Check } from './runner.js';

const checks: Check[] = [
  {
    name: '2.1 ProcedureStep in validEntityTypes array',
    fn: () => fileContains('src/services/ingestion/ValidationService.ts', /validEntityTypes.*ProcedureStep|ProcedureStep.*validEntityTypes/),
  },
  {
    name: '2.2 ProcedureStep case in validateEntityProperties',
    fn: () => fileContains('src/services/ingestion/ValidationService.ts', /case\s+['"]ProcedureStep['"]/),
  },
  {
    name: '2.3 ProcedureStep case in findDuplicateEntity',
    fn: () => fileContains('src/services/graph/Neo4jRepository.ts', /case\s+['"]ProcedureStep['"]/),
  },
  {
    name: '2.4 status param in createRelationship',
    fn: () => fileContains('src/services/graph/Neo4jRepository.ts', /status.*createRelationship|createRelationship.*status/),
  },
  {
    name: '2.5 GraphRepository interface updated with status',
    fn: () => fileContains('src/services/graph/GraphRepository.interface.ts', /status/),
  },
  {
    name: '2.6 bun test passes',
    fn: () => runCommand('bun', ['test']),
  },
];

runValidation(checks);
