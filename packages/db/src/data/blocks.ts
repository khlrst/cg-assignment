import { and, eq, gt } from 'drizzle-orm';
import type { RuntimeEnv } from '../env';
import { getDb } from '../';
import { blocks } from '../schema';
import type { DatabaseClient } from '../';

export type BlockParams = {
  chain_id: number;
  hash: string;
  number: number;
  timestamp: string;
  parent_hash: string;
  finished: boolean;
  version?: number;
};

export async function getLatestBlock(
  env: RuntimeEnv,
  chainId: number,
): Promise<BlockParams | null> {
  const db = getDb(env);
  return (
    (await db.query.blocks.findFirst({
      where: {
        chain_id: { eq: chainId },
      },
      orderBy: {
        number: 'desc',
      },
    })) ?? null
  );
}

export async function isBlockProcessed(
  env: RuntimeEnv,
  hash: string,
  tx?: DatabaseClient,
): Promise<boolean> {
  const db = tx || getDb(env);
  const res = await db.query.blocks.findFirst({
    where: {
      hash: { eq: hash },
    },
  });

  return !!res;
}

export async function getLatestBlocksInRange(
  env: RuntimeEnv,
  chainId: number,
  start: number,
  end: number,
): Promise<BlockParams[]> {
  const db = getDb(env);
  return await db.query.blocks.findMany({
    where: {
      chain_id: { eq: chainId },
      number: { gte: start, lte: end },
    },
    orderBy: {
      number: 'desc',
    },
  });
}

export async function createBlock(
  env: RuntimeEnv,
  block: BlockParams,
  tx?: DatabaseClient,
): Promise<void> {
  const db = tx || getDb(env);
  await db
    .insert(blocks)
    .values({
      number: block.number,
      chain_id: block.chain_id,
      hash: block.hash,
      timestamp: block.timestamp,
      parent_hash: block.parent_hash,
      finished: block.finished,
    })
    .onConflictDoNothing();
}

export async function finishBlock(
  env: RuntimeEnv,
  block: BlockParams,
  chainId: number,
  tx?: DatabaseClient,
): Promise<void> {
  const db = tx || getDb(env);
  await db
    .update(blocks)
    .set({ finished: true })
    .where(and(eq(blocks.number, block.number), eq(blocks.chain_id, chainId)));
}

export async function deleteBlocks(
  env: RuntimeEnv,
  chainId: number,
  blockNumber: number,
  tx?: DatabaseClient,
): Promise<void> {
  const db = tx || getDb(env);
  await db.delete(blocks).where(and(gt(blocks.number, blockNumber), eq(blocks.chain_id, chainId)));
}
