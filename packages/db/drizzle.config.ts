import * as dotenv from 'dotenv';
import type { Config } from 'drizzle-kit';

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

export default {
  schema: './src/schema.ts',
  out: './src/migrations',
  dialect: 'postgresql',
} satisfies Config;
