import {
  type BlockchainClient,
  type BlockHandler,
  EVMBlockchainClient,
  type EventWatch,
  ZeroAddress,
} from '@cg-assignment/evm';
import { type CustomLogger } from '@cg-assignment/logger';
import { getAllWalletsByChainId, getAllTokensByChainId, getLatestBlock } from '@cg-assignment/db';
import { type Config } from './env';
import { Poller, type PollerOptions } from './poller';

export class Indexer {
  private readonly client: BlockchainClient;
  private poller?: Poller;

  constructor(
    private readonly config: Config,
    private readonly logger: CustomLogger,
  ) {
    this.client = new EVMBlockchainClient(config.rpcUrl);
  }

  async stream(blockHandler: BlockHandler): Promise<Poller> {
    this.logger.logStartup(this.config);

    const chainId = Number(await this.client.getChainId());

    const wallets = await getAllWalletsByChainId(
      { DATABASE_URL: this.config.DATABASE_URL },
      chainId,
    );
    const tokens = await getAllTokensByChainId({ DATABASE_URL: this.config.DATABASE_URL }, chainId);
    if (tokens.length === 0) {
      throw new Error('No tokens found');
    }

    const latestBlock = await getLatestBlock({ DATABASE_URL: this.config.DATABASE_URL }, chainId);
    // get the latest block from the database
    // if no latest block, use the minimum fromBlock of the wallets
    let startBlock;
    if (latestBlock) {
      startBlock = latestBlock.number;
    } else {
      startBlock = wallets.reduce(
        (min, wallet) => (wallet.fromBlock < min ? wallet.fromBlock : min),
        wallets[0]!.fromBlock,
      );
    }

    const erc20tokens = tokens
      .map((token) => token.address)
      .filter((token) => token !== ZeroAddress);

    const includesNative = tokens.some((token) => token.address === ZeroAddress);

    const watchEvents: EventWatch[] = [];
    if (includesNative) {
      watchEvents.push({ type: 'native_transfer' });
    }

    watchEvents.push({
      type: 'erc20_transfer',
      tokens: erc20tokens.length > 0 ? erc20tokens : undefined,
    });

    this.logger.info(`Watching ${watchEvents.length} events:`, watchEvents);

    const options: PollerOptions = {
      rpc: this.config.rpcUrl,
      startBlock: startBlock,
      interval: 10_000,
      watch: {
        addresses: wallets.map((wallet) => wallet.address),
        events: watchEvents,
      },
      reorgs: true,
    };

    this.poller = new Poller(this.client, options, blockHandler, this.config);

    return this.poller;
  }

  async stop(): Promise<void> {
    if (!this.poller) {
      return;
    }

    this.logger.info('Stopping indexer...');

    await this.poller.stop();

    this.logger.info('Indexer stopped.');
  }
}
