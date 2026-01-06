export * from './base/Entity.js';
export * from './base/Provenance.js';
export * from './Process.js';
export * from './Audit.js';
export * from './Document.js';
export * from './FailureMode.js';
export * from './Risk.js';
export * from './Control.js';
export * from './Finding.js';
export * from './Requirement.js';

export type Entity =
  | import('./Process.js').Process
  | import('./Audit.js').Audit
  | import('./Document.js').Document
  | import('./FailureMode.js').FailureMode
  | import('./Risk.js').Risk
  | import('./Control.js').Control
  | import('./Finding.js').Finding
  | import('./Requirement.js').Requirement;
