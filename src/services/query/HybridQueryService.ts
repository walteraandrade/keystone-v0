import { logger } from '../../utils/logger.js';
import { GraphPersistenceError } from '../../utils/errors.js';
import type { GraphRepository } from '../graph/GraphRepository.interface.js';
import type { VectorStore, VectorDocument } from '../vector/VectorStore.interface.js';
import type { EmbeddingService } from '../vector/EmbeddingService.js';
import type { Relationship } from '../../domain/relationships/types.js';
import type {
  SemanticSearchParams,
  SemanticSearchResult,
  ContextOptions,
  EntityContextResult,
  AnalyticsParams,
  AnalyticsResult,
  GraphPatternParams,
  GraphPatternResult,
} from './types.js';

export class HybridQueryService {
  constructor(
    private graphRepo: GraphRepository,
    private vectorStore: VectorStore,
    private embeddingService: EmbeddingService
  ) {}

  async semanticSearchWithExpansion(params: SemanticSearchParams): Promise<SemanticSearchResult> {
    const { query, limit = 10, expandDepth = 1, filters } = params;

    try {
      logger.debug({ query, limit, expandDepth }, 'Semantic search with expansion');

      const embedding = await this.embeddingService.generateEmbedding(query);

      const qdrantFilter: Record<string, unknown> = {};
      if (filters?.documentId) {
        qdrantFilter.documentId = filters.documentId;
      }
      if (filters?.semanticType && filters.semanticType.length > 0) {
        qdrantFilter.semanticType = filters.semanticType[0];
      }

      const vectorResults = await this.vectorStore.search(
        embedding,
        limit,
        Object.keys(qdrantFilter).length > 0 ? qdrantFilter : undefined
      );

      const graphNodeIds = vectorResults
        .map(r => r.payload.graphNodeId)
        .filter((id, idx, arr) => arr.indexOf(id) === idx);

      const entities = await this.graphRepo.getEntitiesByIds(graphNodeIds);

      const chunks = await Promise.all(
        vectorResults.map(async (vr, idx) => {
          const entity = entities.find(e => e.id === vr.payload.graphNodeId);
          let relatedEntities = undefined;

          if (entity && expandDepth > 0) {
            const expansion = await this.graphRepo.expandRelationships([entity.id]);
            relatedEntities = expansion.entities.filter(e => e.id !== entity.id);
          }

          return {
            chunkId: vr.id,
            text: vr.payload.chunkText,
            score: vr.score,
            semanticType: (vr.payload as any).semanticType || 'unknown',
            context: (vr.payload as any).context || '',
            entity,
            relatedEntities,
          };
        })
      );

      const semanticTypes: Record<string, number> = {};
      for (const chunk of chunks) {
        semanticTypes[chunk.semanticType] = (semanticTypes[chunk.semanticType] || 0) + 1;
      }

      return {
        chunks,
        aggregations: {
          totalChunks: chunks.length,
          uniqueEntities: entities.length,
          semanticTypes,
        },
      };
    } catch (error) {
      logger.error({ query, error }, 'Semantic search failed');
      throw new GraphPersistenceError('Semantic search failed', error);
    }
  }

  async getEntityWithContext(
    entityId: string,
    options: ContextOptions = {}
  ): Promise<EntityContextResult> {
    const { includeRelationships = false, maxChunks = 50 } = options;

    try {
      logger.debug({ entityId, options }, 'Getting entity with context');

      const entity = await this.graphRepo.getEntity(entityId);
      if (!entity) {
        throw new GraphPersistenceError(`Entity not found: ${entityId}`);
      }

      const vectorChunks = await this.vectorStore.getChunksByGraphNodeIds([entityId]);

      const chunks = vectorChunks.slice(0, maxChunks).map(vc => ({
        chunkId: vc.id,
        text: vc.payload.chunkText,
        context: (vc.payload as any).context || '',
        sourceReference: {
          section: (vc.payload as any).context || 'Unknown',
        },
      }));

      let relationships = undefined;
      if (includeRelationships) {
        relationships = await this.graphRepo.getRelationships(entityId, 'both');
      }

      const provenance = (entity as any).provenance?.[0] || {};

      return {
        entity,
        chunks,
        relationships,
        provenance: {
          documentId: (entity as any).documentId || '',
          fileName: provenance.fileName,
          extractedBy: provenance.extractedBy,
          confidence: provenance.confidence || 1.0,
        },
      };
    } catch (error) {
      logger.error({ entityId, error }, 'Get entity with context failed');
      throw new GraphPersistenceError('Entity context retrieval failed', error);
    }
  }

  async getOntologyAnalytics(params: AnalyticsParams): Promise<AnalyticsResult> {
    const { groupBy, includeGraphStats = true } = params;

    try {
      logger.debug({ groupBy }, 'Getting ontology analytics');

      const byGroup: Record<string, { count: number; avgTokens: number; oversizedCount: number }> = {};
      let totalChunks = 0;
      let totalTokens = 0;

      await this.vectorStore.scrollAll((chunk) => {
        totalChunks++;
        const tokens = (chunk.payload as any).tokens || 0;
        totalTokens += tokens;

        let groupKey: string;
        switch (groupBy) {
          case 'semanticType':
            groupKey = (chunk.payload as any).semanticType || 'unknown';
            break;
          case 'context':
            groupKey = (chunk.payload as any).context || 'unknown';
            break;
          case 'documentId':
            groupKey = chunk.payload.documentId;
            break;
        }

        if (!byGroup[groupKey]) {
          byGroup[groupKey] = { count: 0, avgTokens: 0, oversizedCount: 0 };
        }

        byGroup[groupKey].count++;
        byGroup[groupKey].avgTokens = (byGroup[groupKey].avgTokens * (byGroup[groupKey].count - 1) + tokens) / byGroup[groupKey].count;
        if ((chunk.payload as any).isOversized) {
          byGroup[groupKey].oversizedCount++;
        }
      });

      const vectorStats = {
        totalChunks,
        avgTokens: totalChunks > 0 ? Math.round(totalTokens / totalChunks) : 0,
        byGroup,
      };

      let graphStats = undefined;
      if (includeGraphStats) {
        const entityTypes = ['Process', 'FailureMode', 'Risk', 'Control', 'Finding', 'Requirement', 'Audit', 'Document'];
        const byType: Record<string, number> = {};

        for (const type of entityTypes) {
          const entities = await this.graphRepo.queryByPattern({ nodeLabel: type, limit: 1000 });
          byType[type] = entities.length;
        }

        const highRiskFMs = await this.graphRepo.queryByPattern({
          nodeLabel: 'FailureMode',
          limit: 1000,
        });
        const highRiskCount = highRiskFMs.filter((fm: any) => fm.rpn && fm.rpn > 100).length;

        const findings = await this.graphRepo.queryByPattern({ nodeLabel: 'Finding', limit: 1000 });
        const openFindings = findings.filter((f: any) => f.status === 'OPEN').length;

        graphStats = {
          totalEntities: Object.values(byType).reduce((sum, count) => sum + count, 0),
          byType,
          highRiskFailureModes: highRiskCount,
          openFindings,
        };
      }

      return { vectorStats, graphStats };
    } catch (error) {
      logger.error({ groupBy, error }, 'Ontology analytics failed');
      throw new GraphPersistenceError('Analytics failed', error);
    }
  }

  async queryGraphPattern(params: GraphPatternParams): Promise<GraphPatternResult> {
    const { entityType, filters = {}, relationships, includeVectorContext = false, limit = 20 } = params;

    try {
      logger.debug({ entityType, filters }, 'Graph pattern query');

      let entities = entityType
        ? await this.graphRepo.queryByPattern({ nodeLabel: entityType, properties: filters, limit })
        : [];

      let allRelationships: Relationship[] = [];

      if (relationships && relationships.length > 0 && entities.length > 0) {
        const entityIds = entities.map(e => e.id);
        const relationshipTypes = relationships.map(r => r.type);

        const expansion = await this.graphRepo.expandRelationships(entityIds, relationshipTypes);
        
        // Merge expansion entities with original entities (preserve originals if no relationships found)
        const entityMap = new Map<string, Entity>();
        entities.forEach(e => entityMap.set(e.id, e));
        expansion.entities.forEach(e => entityMap.set(e.id, e));
        entities = Array.from(entityMap.values());
        
        allRelationships = expansion.relationships;
      }

      let chunks = undefined;
      if (includeVectorContext && entities.length > 0) {
        const entityIds = entities.map(e => e.id);
        const vectorChunks = await this.vectorStore.getChunksByGraphNodeIds(entityIds);

        chunks = vectorChunks.map(vc => ({
          entityId: vc.payload.graphNodeId,
          chunkText: vc.payload.chunkText,
          context: (vc.payload as any).context || '',
        }));
      }

      return {
        entities,
        relationships: allRelationships,
        chunks,
      };
    } catch (error) {
      logger.error({ entityType, error }, 'Graph pattern query failed');
      throw new GraphPersistenceError('Graph pattern query failed', error);
    }
  }
}
