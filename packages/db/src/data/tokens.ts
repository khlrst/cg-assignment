import { eq } from 'drizzle-orm';
import type { RuntimeEnv } from '../env';
import { getDb } from '../';
import { tokens } from '../schema';
import type { DatabaseClient } from '../';

export type Token = {
  address: string;
  chain_id: number;
};

export async function saveTokens(
  env: RuntimeEnv,
  token: Token,
  tx?: DatabaseClient,
): Promise<void> {
  const db = tx || getDb(env);
  await db.insert(tokens).values({ chain_id: token.chain_id, address: token.address });
}

export async function getAllTokensByChainId(env: RuntimeEnv, chainId: number): Promise<Token[]> {
  const db = getDb(env);
  const result = await db.select().from(tokens).where(eq(tokens.chain_id, chainId));
  return result;
}
