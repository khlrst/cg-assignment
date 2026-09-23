import {
  type BlockHandler,
  type IndexedBlock,
  ZeroAddress,
  normalizeAddress,
} from '@cg-assignment/evm';
import {
  getDb,
  saveTransfer,
  createBlock,
  isBlockProcessed,
  isTransferProcessed,
  updateBalancesSnapshot,
  type BlockParams,
  type Transfer,
} from '@cg-assignment/db';
import type { Config } from './env';
import type { CustomLogger } from '@cg-assignment/logger';

export function blockHandler(config: Config, logger: CustomLogger): BlockHandler {
  return async (block: IndexedBlock) => {
    const db = getDb({ DATABASE_URL: config.DATABASE_URL });
    await db.transaction(async (tx) => {
      // skip block if already processed
      const isProcessed = await isBlockProcessed(
        { DATABASE_URL: config.DATABASE_URL },
        block.hash,
        tx,
      );
      if (isProcessed) {
        logger.info('handleBlock', { event: block, message: 'block already processed' });
        return;
      }

      // translate into block params
      const blockParams: BlockParams = {
        chain_id: block.chainId,
        hash: block.hash,
        number: block.number,
        timestamp: new Date(block.timestamp * 1000).toISOString(),
        parent_hash: block.parentHash,
        finished: false,
      };

      // create block
      await createBlock({ DATABASE_URL: config.DATABASE_URL }, blockParams, tx);

      logger.info('handleBlock', { event: blockParams, message: 'created block' });

      for (const event of block.events) {
        const index = event.type === 'erc20_transfer' ? event.logIndex : event.traceIndex;
        const address = event.type === 'erc20_transfer' ? event.token : ZeroAddress;
        const transfer: Transfer = {
          id: `${blockParams.chain_id}:${blockParams.hash}:${index}`.toLowerCase(),
          chain_id: blockParams.chain_id,
          block_number: blockParams.number,
          block_hash: blockParams.hash,
          token_address: normalizeAddress(address),
          from_address: normalizeAddress(event.from),
          to_address: normalizeAddress(event.to),
          value: event.amount.toString(),
          index,
        };

        const isProcessed = await isTransferProcessed(
          { DATABASE_URL: config.DATABASE_URL },
          transfer,
          tx,
        );

        if (isProcessed) {
          logger.info('handleBlock', { event: transfer, message: 'transfer already processed' });
          return;
        }

        await saveTransfer({ DATABASE_URL: config.DATABASE_URL }, transfer, tx);

        logger.info('handleBlock', { event: transfer, message: 'saved transfer' });
      }
      await updateBalancesSnapshot(
        { DATABASE_URL: config.DATABASE_URL },
        blockParams.chain_id,
        config.confirmations,
        tx,
      );
    });
  };
}
