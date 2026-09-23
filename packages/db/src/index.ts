import { Pool, type PoolConfig } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { RuntimeEnv } from './env';
import { relations } from './relations';

export * from './data';
export * from './env';

export type DatabaseClient = Omit<ReturnType<typeof getDb>, '$client'>;
export type Db = ReturnType<typeof drizzle<typeof relations>>;

type DbOptions = PoolConfig & {
  /**
   * Set this explicitly when automatic runtime detection is unsuitable.
   */
  runtime?: 'cloudflare' | 'node';
};

type DbInstance = {
  db: Db;
  pool: Pool;
};

const dbCache = new Map<string, DbInstance>();

function createDb(connectionString: string, options: PoolConfig = {}): DbInstance {
  const pool = new Pool({
    connectionString,
    ...options,
  });

  const db = drizzle({
    client: pool,
    relations,
  });

  return {
    db,
    pool,
  };
}

function isCloudflareEnvironment(env?: RuntimeEnv): boolean {
  return Boolean(env?.HYPERDRIVE?.connectionString);
}

function getConnectionString(env?: RuntimeEnv): string {
  const connectionString =
    env?.HYPERDRIVE?.connectionString ?? env?.DATABASE_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'Database connection string is missing. ' +
        'Expected env.HYPERDRIVE.connectionString or DATABASE_URL.',
    );
  }

  return connectionString;
}

export function getDb(env?: RuntimeEnv, options: DbOptions = {}): Db {
  const { runtime, max, idleTimeoutMillis, connectionTimeoutMillis, ...poolOptions } = options;

  const cloudflare =
    runtime === 'cloudflare' || (runtime !== 'node' && isCloudflareEnvironment(env));

  const connectionString = getConnectionString(env);

  if (cloudflare) {
    const { db } = createDb(connectionString, {
      max: max ?? 1,
      idleTimeoutMillis,
      connectionTimeoutMillis,
      ...poolOptions,
    });

    return db;
  }

  const cacheKey = connectionString;

  const existing = dbCache.get(cacheKey);

  if (existing) {
    return existing.db;
  }

  const instance = createDb(connectionString, {
    max: max ?? 5,
    idleTimeoutMillis: idleTimeoutMillis ?? 30_000,
    connectionTimeoutMillis: connectionTimeoutMillis ?? 5_000,
    ...poolOptions,
  });

  dbCache.set(cacheKey, instance);

  return instance.db;
}

export function getDbWithPool(env?: RuntimeEnv, options: DbOptions = {}): DbInstance {
  const { runtime, max, idleTimeoutMillis, connectionTimeoutMillis, ...poolOptions } = options;

  const cloudflare =
    runtime === 'cloudflare' || (runtime !== 'node' && isCloudflareEnvironment(env));

  const connectionString = getConnectionString(env);

  if (cloudflare) {
    return createDb(connectionString, {
      max: max ?? 1,
      idleTimeoutMillis,
      connectionTimeoutMillis,
      ...poolOptions,
    });
  }

  const cacheKey = connectionString;
  const existing = dbCache.get(cacheKey);

  if (existing) {
    return existing;
  }

  const instance = createDb(connectionString, {
    max: max ?? 5,
    idleTimeoutMillis: idleTimeoutMillis ?? 30_000,
    connectionTimeoutMillis: connectionTimeoutMillis ?? 5_000,
    ...poolOptions,
  });

  dbCache.set(cacheKey, instance);

  return instance;
}

export async function closeDb(): Promise<void> {
  await Promise.all([...dbCache.values()].map(({ pool }) => pool.end()));

  dbCache.clear();
}
