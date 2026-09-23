/* eslint-disable no-console */
import { join } from 'path';
import { fileURLToPath } from 'url';

import * as dotenv from 'dotenv';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { getDb } from './';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const db = getDb();

  console.log('Running migrations...');

  await migrate(db, { migrationsFolder: join(__dirname, 'migrations') });

  console.log('Migrations completed successfully');

  process.exit(0);
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
