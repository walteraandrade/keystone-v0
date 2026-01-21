import neo4j from 'neo4j-driver';
import { logger } from '../../utils/logger.js';
import type { GraphRepository } from '../graph/GraphRepository.interface.js';
import type { Entity } from '../../domain/entities/index.js';

export type CoverageQueryName = 'risks-without-controls' | 'controls-without-steps' | 'unmitigated-high-rpn';

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
      default:
        throw new Error(`Unknown coverage query: ${queryName}`);
    }
  }

  getAvailableQueries(): Array<{ name: CoverageQueryName; description: string; params?: string[] }> {
    return [
      { name: 'risks-without-controls', description: 'Risks with no MITIGATES relationship from controls' },
      { name: 'controls-without-steps', description: 'Controls with no IMPLEMENTS relationship from procedure steps' },
      { name: 'unmitigated-high-rpn', description: 'Failure modes with RPN above threshold and no mitigation', params: ['threshold'] },
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
}
