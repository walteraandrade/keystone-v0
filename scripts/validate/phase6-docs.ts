import { runValidation, fileExists, fileContains, runCommand, type Check } from './runner.js';

const checks: Check[] = [
  {
    name: '6.1 ONTOLOGY_VERSIONING.md exists',
    fn: () => fileExists('docs/ONTOLOGY_VERSIONING.md'),
  },
  {
    name: '6.2 README updated with new endpoints',
    fn: () => fileContains('README.md', /coverage|cleanup|admin/i),
  },
  {
    name: '6.3 git tag ontology-v1.1.0 exists',
    fn: () => runCommand('git', ['tag', '-l', 'ontology-v1.1.0']),
  },
];

runValidation(checks);
