import 'dotenv/config';
import neo4j from 'neo4j-driver';
import { existsSync, unlinkSync } from 'fs';
import { createInterface } from 'readline';

const EXTRACTION_DB_PATH = process.env.EXTRACTION_LOG_DB || './data/extraction.db';

const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function resetNeo4j(): Promise<{ deleted: number }> {
  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(
      process.env.NEO4J_USER || 'neo4j',
      process.env.NEO4J_PASSWORD || 'password'
    )
  );

  const session = driver.session();
  try {
    const countResult = await session.run('MATCH (n) RETURN count(n) as count');
    const beforeCount = countResult.records[0].get('count').toNumber();

    await session.run('MATCH (n) DETACH DELETE n');

    const verifyResult = await session.run('MATCH (n) RETURN count(n) as count');
    const afterCount = verifyResult.records[0].get('count').toNumber();

    if (afterCount !== 0) {
      throw new Error(`Neo4j verification failed: ${afterCount} nodes remain`);
    }

    return { deleted: beforeCount };
  } finally {
    await session.close();
    await driver.close();
  }
}

function resetSQLite(): { deleted: boolean; path: string } {
  if (existsSync(EXTRACTION_DB_PATH)) {
    unlinkSync(EXTRACTION_DB_PATH);
    if (existsSync(EXTRACTION_DB_PATH)) {
      throw new Error(`SQLite verification failed: file still exists`);
    }
    return { deleted: true, path: EXTRACTION_DB_PATH };
  }
  return { deleted: false, path: EXTRACTION_DB_PATH };
}

async function main() {
  const nodeEnv = process.env.NODE_ENV || 'development';

  console.log('\n' + yellow('⚠️  DATABASE RESET'));
  console.log(`Environment: ${nodeEnv}`);
  console.log(`Neo4j URI: ${process.env.NEO4J_URI || 'bolt://localhost:7687'}`);
  console.log(`SQLite path: ${EXTRACTION_DB_PATH}\n`);

  if (nodeEnv === 'production') {
    console.error(red('❌ BLOCKED: Cannot reset production database'));
    console.error(red('   Set NODE_ENV to development or test\n'));
    process.exit(1);
  }

  const answer = await prompt(yellow('Type "reset" to confirm: '));
  if (answer !== 'reset') {
    console.log('\nAborted.\n');
    process.exit(0);
  }

  console.log('\nResetting databases...\n');

  try {
    const neo4jResult = await resetNeo4j();
    console.log(green(`✓ Neo4j: deleted ${neo4jResult.deleted} nodes`));
  } catch (error) {
    console.error(red(`✗ Neo4j reset failed: ${error}`));
    process.exit(1);
  }

  try {
    const sqliteResult = resetSQLite();
    if (sqliteResult.deleted) {
      console.log(green(`✓ SQLite: deleted ${sqliteResult.path}`));
    } else {
      console.log(yellow(`○ SQLite: no file at ${sqliteResult.path}`));
    }
  } catch (error) {
    console.error(red(`✗ SQLite reset failed: ${error}`));
    process.exit(1);
  }

  console.log(green('\n✓ All databases reset and verified\n'));
}

main().catch(err => {
  console.error(red(`Fatal error: ${err}`));
  process.exit(1);
});
