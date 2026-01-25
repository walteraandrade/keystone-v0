#!/usr/bin/env bun
import 'dotenv/config';
import { QdrantVectorStore } from '../src/services/vector/QdrantVectorStore.js';
import { Neo4jVectorStore } from '../src/services/vector/Neo4jVectorStore.js';
import type { VectorDocument } from '../src/services/vector/VectorStore.interface.js';

const BATCH_SIZE = 100;

const migrate = async (): Promise<void> => {
  console.log('Starting Qdrant → Neo4j vector migration...\n');

  const qdrant = new QdrantVectorStore();
  const neo4j = new Neo4jVectorStore();

  try {
    console.log('Connecting to Qdrant...');
    await qdrant.connect();
    console.log('✓ Connected to Qdrant\n');

    console.log('Connecting to Neo4j...');
    await neo4j.connect();
    console.log('✓ Connected to Neo4j\n');

    const chunks: VectorDocument[] = [];
    let totalCount = 0;

    console.log('Scrolling all chunks from Qdrant...');
    await qdrant.scrollAll(chunk => {
      chunks.push(chunk);
      totalCount++;
      if (totalCount % 500 === 0) {
        console.log(`  Collected ${totalCount} chunks...`);
      }
    });
    console.log(`✓ Collected ${totalCount} chunks from Qdrant\n`);

    if (chunks.length === 0) {
      console.log('No chunks to migrate. Exiting.');
      return;
    }

    console.log(`Migrating ${chunks.length} chunks to Neo4j in batches of ${BATCH_SIZE}...`);
    let migrated = 0;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      await neo4j.upsertDocuments(batch);
      migrated += batch.length;
      console.log(`  Migrated ${migrated}/${chunks.length} chunks (${Math.round(migrated / chunks.length * 100)}%)`);
    }

    console.log(`\n✓ Migration complete: ${migrated} chunks migrated\n`);

    console.log('Verifying migration...');
    const neo4jCount = await neo4j.countByFilter({});
    console.log(`  Qdrant count: ${totalCount}`);
    console.log(`  Neo4j count:  ${neo4jCount}`);

    if (neo4jCount === totalCount) {
      console.log('✓ Verification passed: counts match\n');
    } else {
      console.log('⚠ Verification warning: counts differ\n');
    }

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await qdrant.disconnect();
    await neo4j.disconnect();
  }
};

migrate();
