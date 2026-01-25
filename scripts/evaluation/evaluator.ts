import type { Neo4jRepository } from '../../src/services/graph/Neo4jRepository.js';
import type { GroundTruth, EvaluationScore, ChunkResult, PropertyFilter } from './types.js';

export class GroundTruthEvaluator {
  constructor(private neo4j: Neo4jRepository) {}

  async evaluate(
    questionId: number,
    retrievedChunks: ChunkResult[],
    groundTruth: GroundTruth
  ): Promise<EvaluationScore> {
    const scores: EvaluationScore = {
      entityPrecision: 0,
      entityRecall: 0,
      entityF1: 0,
      tokenCoverage: 0,
      countAccuracy: null,
    };

    // 1. Entity-level scoring
    if (groundTruth.expectedEntityQuery) {
      const expected = await this.queryExpectedEntities(groundTruth);
      const retrieved = this.extractRetrievedEntities(retrievedChunks);

      if (expected.size > 0 || retrieved.size > 0) {
        const intersection = this.intersect(expected, retrieved);
        scores.entityPrecision = retrieved.size > 0 ? intersection.size / retrieved.size : 0;
        scores.entityRecall = expected.size > 0 ? intersection.size / expected.size : 0;
        scores.entityF1 = this.f1(scores.entityPrecision, scores.entityRecall);
      }

      // For aggregation questions, store expected count
      if (groundTruth.category === 'aggregation') {
        scores.countAccuracy = this.computeCountAccuracy(expected.size, retrieved.size);
      }
    }

    // 2. Token coverage
    if (groundTruth.requiredKeywords?.length) {
      const context = retrievedChunks.map(c => c.text).join(' ').toLowerCase();
      const found = groundTruth.requiredKeywords.filter(k =>
        context.includes(k.toLowerCase())
      );
      scores.tokenCoverage = found.length / groundTruth.requiredKeywords.length;
    }

    return scores;
  }

  async queryExpectedEntities(groundTruth: GroundTruth): Promise<Set<string>> {
    const query = groundTruth.expectedEntityQuery;
    if (!query) return new Set();

    try {
      const { nodeLabel, properties = {}, relationshipFilter } = query;

      // Build Cypher query with advanced filters
      const whereClauses: string[] = [];
      const params: Record<string, unknown> = { limit: 100 };

      for (const [key, value] of Object.entries(properties)) {
        if (this.isPropertyFilter(value)) {
          if (value.$contains) {
            whereClauses.push(`toLower(n.${key}) CONTAINS toLower($${key}_contains)`);
            params[`${key}_contains`] = value.$contains;
          }
          if (value.$gt !== undefined) {
            whereClauses.push(`n.${key} > $${key}_gt`);
            params[`${key}_gt`] = value.$gt;
          }
          if (value.$gte !== undefined) {
            whereClauses.push(`n.${key} >= $${key}_gte`);
            params[`${key}_gte`] = value.$gte;
          }
          if (value.$lt !== undefined) {
            whereClauses.push(`n.${key} < $${key}_lt`);
            params[`${key}_lt`] = value.$lt;
          }
          if (value.$lte !== undefined) {
            whereClauses.push(`n.${key} <= $${key}_lte`);
            params[`${key}_lte`] = value.$lte;
          }
          if (value.$in) {
            whereClauses.push(`n.${key} IN $${key}_in`);
            params[`${key}_in`] = value.$in;
          }
        } else {
          whereClauses.push(`n.${key} = $${key}`);
          params[key] = value;
        }
      }

      let cypher: string;
      if (relationshipFilter) {
        const { type, direction, targetLabel } = relationshipFilter;
        const relPattern = direction === 'in'
          ? `<-[:${type}]-(target${targetLabel ? `:${targetLabel}` : ''})`
          : direction === 'out'
            ? `-[:${type}]->(target${targetLabel ? `:${targetLabel}` : ''})`
            : `-[:${type}]-(target${targetLabel ? `:${targetLabel}` : ''})`;

        cypher = `
          MATCH (n:${nodeLabel})${relPattern}
          ${whereClauses.length ? 'WHERE ' + whereClauses.join(' AND ') : ''}
          RETURN DISTINCT n.id as id
          LIMIT $limit
        `;
      } else {
        cypher = `
          MATCH (n:${nodeLabel})
          ${whereClauses.length ? 'WHERE ' + whereClauses.join(' AND ') : ''}
          RETURN n.id as id
          LIMIT $limit
        `;
      }

      const results = await this.neo4j.executeQuery<{ id: string }>(cypher, params);
      return new Set(results.map(r => r.id).filter(Boolean));
    } catch (error) {
      console.error(`Failed to query expected entities for Q${groundTruth.questionId}:`, error);
      return new Set();
    }
  }

  extractRetrievedEntities(chunks: ChunkResult[]): Set<string> {
    const ids = new Set<string>();

    for (const chunk of chunks) {
      if (chunk.entity?.id) {
        ids.add(chunk.entity.id);
      }
      if (chunk.relatedEntities) {
        for (const rel of chunk.relatedEntities) {
          if (rel.id) ids.add(rel.id);
        }
      }
    }

    return ids;
  }

  private isPropertyFilter(value: unknown): value is PropertyFilter {
    if (!value || typeof value !== 'object') return false;
    const keys = Object.keys(value);
    return keys.some(k => ['$gt', '$gte', '$lt', '$lte', '$contains', '$in'].includes(k));
  }

  private intersect(a: Set<string>, b: Set<string>): Set<string> {
    const result = new Set<string>();
    a.forEach(item => {
      if (b.has(item)) result.add(item);
    });
    return result;
  }

  private f1(precision: number, recall: number): number {
    if (precision + recall === 0) return 0;
    return (2 * precision * recall) / (precision + recall);
  }

  private computeCountAccuracy(expected: number, retrieved: number): number {
    if (expected === 0) return retrieved === 0 ? 1 : 0;
    return Math.max(0, 1 - Math.abs(expected - retrieved) / expected);
  }
}
