import type { RuntimeEnv } from '../env';
import { getDb } from '../index';
import { transfers } from '../schema';
import type { DatabaseClient } from '../';

export type Transfer = {
  id: string;
  chain_id: number;
  block_number: number;
  block_hash: string;
  token_address: string;
  from_address: string;
  to_address: string;
  value: string;
  index: number;
  version?: number;
};

export async function isTransferProcessed(
  env: RuntimeEnv,
  transfer: Transfer,
  tx?: DatabaseClient,
): Promise<boolean> {
  const db = tx || getDb(env);
  const res = await db.query.transfers.findFirst({
    where: {
      id: transfer.id,
    },
  });
  return !!res;
}

export async function saveTransfer(
  env: RuntimeEnv,
  transfer: Transfer,
  tx?: DatabaseClient,
): Promise<void> {
  const db = tx || getDb(env);
  await db
    .insert(transfers)
    .values({
      id: transfer.id,
      chain_id: transfer.chain_id,
      block_number: transfer.block_number,
      block_hash: transfer.block_hash,
      token_address: transfer.token_address,
      from_address: transfer.from_address,
      to_address: transfer.to_address,
      value: transfer.value,
      index: transfer.index,
    })
    .onConflictDoNothing({
      target: [transfers.id],
    });
}
