import {
  type ChainReader,
  type ReorgHandler,
  type BlockReference,
  withRetry,
} from '@cg-assignment/evm';
import { getLastBlocks, deleteBlocksAfter } from '@cg-assignment/db';
import { type CustomLogger } from '@cg-assignment/logger';
import { type Config } from './env';

const REORG_LOOKBACK_BLOCKS = 100;

export function handleReorg(config: Config, logger: CustomLogger): ReorgHandler {
  return async (reorg, chain: ChainReader) => {
    const chainId = reorg.newHead.chainId;
    const env = { DATABASE_URL: config.DATABASE_URL };

    logger.info('Detected parent hash mismatch; starting reorg reconciliation', {
      chainId,
      previousHead: reorg.previousHead,
      newHead: reorg.newHead,
      lookbackBlocks: REORG_LOOKBACK_BLOCKS,
    });

    const latestBlocks = await getLastBlocks(env, chainId, REORG_LOOKBACK_BLOCKS);

    if (latestBlocks.length === 0) {
      throw new Error(
        `Cannot reconcile reorg on chain ${chainId}: no indexed blocks exist in the database`,
      );
    }

    for (const dbBlock of latestBlocks) {
      const canonicalBlock = await getCanonicalBlock(config, chain, BigInt(dbBlock.number));

      if (!canonicalBlock) {
        throw new Error(
          `Cannot reconcile reorg on chain ${chainId}: provider returned no block at height ${dbBlock.number}`,
        );
      }

      if (sameHash(dbBlock.hash, canonicalBlock.hash)) {
        const orphanedFromBlock = dbBlock.number + 1;
        const orphanedToBlock = reorg.previousHead.number;
        const orphanedBlockCount = Math.max(0, orphanedToBlock - dbBlock.number);

        logger.info('Found common ancestor; deleting orphaned indexed blocks', {
          chainId,
          commonAncestor: {
            number: dbBlock.number,
            hash: dbBlock.hash,
          },
          oldHead: reorg.previousHead,
          providerHead: reorg.newHead,
          orphanedRange: {
            from: orphanedFromBlock,
            to: orphanedToBlock,
            count: orphanedBlockCount,
          },
        });

        await deleteBlocksAfter(env, chainId, dbBlock.number);

        logger.info('Reorg rollback complete:', {
          chainId,
          resumeFrom: {
            number: dbBlock.number,
            hash: dbBlock.hash,
          },
          nextBlock: dbBlock.number + 1,
        });

        return {
          type: 'reorg',
          head: {
            chainId,
            number: dbBlock.number,
            hash: dbBlock.hash,
          },
        };
      }

      logger.debug('Block hash mismatch while searching for reorg common ancestor', {
        chainId,
        blockNumber: dbBlock.number,
        databaseHash: dbBlock.hash,
        providerHash: canonicalBlock.hash,
      });
    }

    const oldestCheckedBlock = latestBlocks[latestBlocks.length - 1];

    const err = new Error(
      [
        `Unable to reconcile reorg for chain ${chainId}.`,
        `No common ancestor was found among the latest ${latestBlocks.length} indexed blocks.`,
        `Oldest checked block was ${oldestCheckedBlock?.number} (${oldestCheckedBlock?.hash}).`,
      ].join(' '),
    );

    logger.logError('No common ancestor found inside configured reorg lookback window', err);

    throw err;
  };
}

export async function getCanonicalBlock(
  config: Config,
  chain: ChainReader,
  blockNumber: bigint,
): Promise<BlockReference | null> {
  const block = await withRetry(
    () => chain.getBlock(blockNumber),
    config.retryPolicy.maxRetries,
    config.retryPolicy.delay,
  );

  if (!block) {
    return null;
  }

  if (block.number !== Number(blockNumber)) {
    throw new Error(
      [
        'Provider returned a block with an unexpected height.',
        `Expected ${blockNumber.toString()}, received ${block.number}.`,
      ].join(' '),
    );
  }

  return block;
}

function sameHash(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}
