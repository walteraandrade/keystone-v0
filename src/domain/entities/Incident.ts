import type { BaseEntity } from './base/Entity.js'

export type IncidentSeverity = 'MINOR' | 'MODERATE' | 'SERIOUS' | 'PSIF'
export type IncidentStatus = 'REPORTED' | 'INVESTIGATING' | 'ANALYZED' | 'CLOSED'
export type IncidentRootCause = 'CONTROL_GAP' | 'NON_COMPLIANCE' | 'UNKNOWN'

export interface Incident extends BaseEntity {
  type: 'Incident'
  code: string
  description: string
  severity: IncidentSeverity
  status: IncidentStatus
  occurredAt: string
  location?: string
  rootCause?: IncidentRootCause
  processId?: string
}
