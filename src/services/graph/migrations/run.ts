import { readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import neo4j from 'neo4j-driver';
import { config } from '../../../config/index.js';
import { logger } from '../../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigrations() {
  const driver = neo4j.driver(
    config.neo4j.uri,
    neo4j.auth.basic(config.neo4j.user, config.neo4j.password)
  );

  try {
    await driver.verifyConnectivity();
    logger.info('Connected to Neo4j');

    const constraintsPath = join(__dirname, 'constraints.cypher');
    const cypher = await readFile(constraintsPath, 'utf-8');

    const statements = cypher
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('//'));

    const session = driver.session();

    try {
      for (const statement of statements) {
        logger.info({ statement: statement.substring(0, 50) + '...' }, 'Executing');
        await session.run(statement);
      }

      logger.info('Migrations completed successfully');
    } finally {
      await session.close();
    }
  } catch (error) {
    logger.error({ error }, 'Migration failed');
    throw error;
  } finally {
    await driver.close();
  }
}

runMigrations().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
