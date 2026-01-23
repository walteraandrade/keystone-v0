import neo4j from 'neo4j-driver';
import { logger } from '../../utils/logger.js';
import type { GraphRepository } from '../graph/GraphRepository.interface.js';
import type { Entity } from '../../domain/entities/index.js';

export type CoverageQueryName =
  | 'risks-without-controls'
  | 'controls-without-steps'
  | 'unmitigated-high-rpn'
  | 'risks-without-procedure-controls'
  | 'ipar-controls-coverage'
  | 'procedures-affected-by-ipar-update';

export interface CoverageQueryResult {
  queryName: CoverageQueryName;
  entities: Entity[];
  count: number;
  params?: Record<string, unknown>;
}

type Neo4jRepositoryWithSession = GraphRepository & {
  runCoverageQuery(query: string, params?: Record<string, unknown>): Promise<Entity[]>;
};

export class CoverageQueryRegistry {
  constructor(private graphRepo: Neo4jRepositoryWithSession) {}

  async execute(queryName: CoverageQueryName, params?: Record<string, unknown>): Promise<CoverageQueryResult> {
    logger.debug({ queryName, params }, 'Executing coverage query');

    switch (queryName) {
      case 'risks-without-controls':
        return this.risksWithoutControls();
      case 'controls-without-steps':
        return this.controlsWithoutSteps();
      case 'unmitigated-high-rpn':
        return this.unmitigatedHighRpn(params?.threshold as number);
      case 'risks-without-procedure-controls':
        return this.risksWithoutProcedureControls();
      case 'ipar-controls-coverage':
        return this.iparControlsCoverage(params?.documentId as string);
      case 'procedures-affected-by-ipar-update':
        return this.proceduresAffectedByIparUpdate(params?.iparId as string);
      default:
        throw new Error(`Unknown coverage query: ${queryName}`);
    }
  }

  getAvailableQueries(): Array<{ name: CoverageQueryName; description: string; params?: string[] }> {
    return [
      { name: 'risks-without-controls', description: 'Risks with no MITIGATES relationship from controls' },
      { name: 'controls-without-steps', description: 'Controls with no IMPLEMENTS relationship from procedure steps' },
      { name: 'unmitigated-high-rpn', description: 'Failure modes with RPN above threshold and no mitigation', params: ['threshold'] },
      { name: 'risks-without-procedure-controls', description: 'Risks with controls that have no ProcedureStep implementation' },
      { name: 'ipar-controls-coverage', description: 'Controls from IPAR without ProcedureStep implementation', params: ['documentId'] },
      { name: 'procedures-affected-by-ipar-update', description: 'Processes needing update due to unmitigated IPAR risks', params: ['iparId'] },
    ];
  }

  private async risksWithoutControls(): Promise<CoverageQueryResult> {
    const query = `
      MATCH (r:Risk)
      WHERE NOT ()-[:MITIGATES]->(r)
      RETURN r
      ORDER BY r.createdAt DESC
      LIMIT 100
    `;
    const entities = await this.graphRepo.runCoverageQuery(query);
    return {
      queryName: 'risks-without-controls',
      entities,
      count: entities.length,
    };
  }

  private async controlsWithoutSteps(): Promise<CoverageQueryResult> {
    const query = `
      MATCH (c:Control)
      WHERE NOT (:ProcedureStep)-[:IMPLEMENTS]->(c)
      RETURN c
      ORDER BY c.createdAt DESC
      LIMIT 100
    `;
    const entities = await this.graphRepo.runCoverageQuery(query);
    return {
      queryName: 'controls-without-steps',
      entities,
      count: entities.length,
    };
  }

  private async unmitigatedHighRpn(threshold: number = 100): Promise<CoverageQueryResult> {
    const query = `
      MATCH (fm:FailureMode)
      WHERE fm.rpn > $threshold AND NOT (:Control)-[:MITIGATES]->(fm)
      RETURN fm
      ORDER BY fm.rpn DESC
      LIMIT 100
    `;
    const entities = await this.graphRepo.runCoverageQuery(query, { threshold: neo4j.int(threshold) });
    return {
      queryName: 'unmitigated-high-rpn',
      entities,
      count: entities.length,
      params: { threshold },
    };
  }

  private async risksWithoutProcedureControls(): Promise<CoverageQueryResult> {
    const query = `
      MATCH (r:Risk)
      WHERE NOT EXISTS {
        MATCH (c:Control)-[:MITIGATES]->(r)
        MATCH (:ProcedureStep)-[:IMPLEMENTS]->(c)
      }
      AND NOT EXISTS {
        MATCH (c:Control)-[:MITIGATES]->(fm:FailureMode)-[:IMPLIES]->(r)
        MATCH (:ProcedureStep)-[:IMPLEMENTS]->(c)
      }
      RETURN r
      ORDER BY r.createdAt DESC
      LIMIT 100
    `;
    const entities = await this.graphRepo.runCoverageQuery(query);
    return {
      queryName: 'risks-without-procedure-controls',
      entities,
      count: entities.length,
    };
  }

  private async iparControlsCoverage(documentId: string): Promise<CoverageQueryResult> {
    if (!documentId) {
      throw new Error('documentId parameter is required for ipar-controls-coverage query');
    }
    const query = `
      MATCH (ipar:Document {id: $documentId, documentType: 'ipar'})-[:IDENTIFIES]->(fm:FailureMode)
      MATCH (c:Control)-[:MITIGATES]->(fm)
      WHERE NOT EXISTS {
        MATCH (ps:ProcedureStep)-[:IMPLEMENTS]->(c)
      }
      RETURN DISTINCT c as entity
      ORDER BY c.createdAt DESC
      LIMIT 100
    `;
    const entities = await this.graphRepo.runCoverageQuery(query, { documentId });
    return {
      queryName: 'ipar-controls-coverage',
      entities,
      count: entities.length,
      params: { documentId },
    };
  }

  private async proceduresAffectedByIparUpdate(iparId: string): Promise<CoverageQueryResult> {
    if (!iparId) {
      throw new Error('iparId parameter is required for procedures-affected-by-ipar-update query');
    }
    const query = `
      MATCH (ipar:Document {id: $iparId})-[:IDENTIFIES]->(fm:FailureMode)
      MATCH (fm)-[:IMPLIES]->(risk:Risk)
      MATCH (ipar)-[:RELATES_TO]->(proc:Process)
      WHERE NOT EXISTS {
        MATCH (ps:ProcedureStep {processId: proc.id})-[:IMPLEMENTS]->(c:Control)
        WHERE (c)-[:MITIGATES]->(fm) OR (c)-[:MITIGATES]->(risk)
      }
      RETURN DISTINCT proc as entity
      ORDER BY proc.name
      LIMIT 100
    `;
    const entities = await this.graphRepo.runCoverageQuery(query, { iparId });
    return {
      queryName: 'procedures-affected-by-ipar-update',
      entities,
      count: entities.length,
      params: { iparId },
    };
  }
}
