import {
  type BlockReference,
  type BlockchainClient,
  type BlockchainBlock,
  type ReorgHandler,
  type BlockHandler,
  type EventWatch,
  type ERC20TransferWatch,
  type IndexedBlock,
  type IndexedEvent,
  type Reorg,
  type ERC20TransferEvent,
  type NativeTransferEvent,
  ERC20_TRANSFER_TOPIC,
  decodeERC20Transfer,
  normalizeAddress,
  normalizeHash,
  ChainReaderImpl,
  withRetry,
} from '@cg-assignment/evm';
import { type Config } from './env';

type StreamState = 'idle' | 'running' | 'paused' | 'stopped';

type FetchResult =
  | {
      type: 'block';
      block: IndexedBlock;
    }
  | {
      type: 'reorg';
      reorg: Reorg;
    };

export type PollerOptions = {
  rpc: string;
  // Block from which indexing starts.
  startBlock: number;
  interval: number;
  watch: {
    addresses: string[];
    events: EventWatch[];
  };
  // Whether reorganization handling is enabled.
  reorgs?: boolean;
};

export class Poller {
  private state: StreamState = 'idle';

  /**
   * Last block successfully handed to the application.
   */
  private head?: BlockReference;
  private reorgHandler?: ReorgHandler;
  private readonly abortController = new AbortController();
  private readonly watchedAddresses: Set<string>;
  private readonly watchedTokens: Set<string>;
  private chainId!: bigint;

  constructor(
    private readonly client: BlockchainClient,
    private readonly options: PollerOptions,
    private readonly blockHandler: BlockHandler,
    private readonly config: Config,
  ) {
    this.watchedAddresses = new Set(options.watch.addresses.map(normalizeAddress));
    this.watchedTokens = new Set(
      options.watch.events
        .filter((event): event is ERC20TransferWatch => event.type === 'erc20_transfer')
        .flatMap((event) => event.tokens ?? [])
        .map(normalizeAddress),
    );
  }

  onReorg(handler: ReorgHandler): this {
    this.reorgHandler = handler;

    return this;
  }

  async run(): Promise<void> {
    if (this.state !== 'idle') {
      throw new Error('Indexer stream has already been started');
    }

    this.state = 'running';

    try {
      this.chainId = await withRetry(
        () => this.client.getChainId(),
        this.config.retryPolicy.maxRetries,
        this.config.retryPolicy.delay,
      );
      await this.poll();
    } finally {
      this.state = 'stopped';
    }
  }

  async stop(): Promise<void> {
    if (this.state === 'idle' || this.state === 'stopped') {
      return;
    }

    this.state = 'stopped';
    this.abortController.abort();
  }

  private async poll(): Promise<void> {
    while (this.state === 'running') {
      const result = await this.fetchNext();

      if (!result) {
        await this.wait();
        continue;
      }

      switch (result.type) {
        case 'block':
          await this.handleBlock(result.block);
          break;
        case 'reorg':
          await this.handleReorg(result.reorg);
          break;
        default:
          throw new Error(`Unknown result type: ${result}`);
      }
    }
  }

  private async handleBlock(block: IndexedBlock): Promise<void> {
    /*
     * Do not advance the head until the application
     * successfully processes the block.
     */
    await this.blockHandler(block);

    this.head = {
      chainId: Number(this.chainId),
      number: block.number,
      hash: block.hash,
    };
  }

  private async fetchNext(): Promise<FetchResult | null> {
    const latestBlock = await withRetry(
      () => this.client.getBlockNumber(),
      this.config.retryPolicy.maxRetries,
      this.config.retryPolicy.delay,
    );
    const nextBlock = this.head === undefined ? this.options.startBlock : this.head.number + 1;

    if (nextBlock > BigInt(latestBlock)) {
      return null;
    }

    const block = await withRetry(
      () => this.client.getBlock(Number(nextBlock)),
      this.config.retryPolicy.maxRetries,
      this.config.retryPolicy.delay,
    );

    if (!block) {
      return null;
    }

    // if there is no previous head to compare against.
    if (!this.head) {
      return {
        type: 'block',
        block: await this.indexBlock(block),
      };
    }

    if (normalizeHash(block.parentHash) === normalizeHash(this.head.hash)) {
      return {
        type: 'block',
        block: await this.indexBlock(block),
      };
    }

    if (!this.options.reorgs) {
      throw new Error(
        [
          'Chain reorganization detected',
          `previous head: ${this.head.number}`,
          `previous hash: ${this.head.hash}`,
          `new block: ${block.number}`,
          `new parent: ${block.parentHash}`,
        ].join('\n'),
      );
    }

    return {
      type: 'reorg',
      reorg: {
        previousHead: this.head,
        newHead: {
          chainId: Number(this.chainId),
          number: block.number,
          hash: block.hash,
        },
      },
    };
  }

  private async indexBlock(block: BlockchainBlock): Promise<IndexedBlock> {
    const events = await this.fetchEvents(block.number);

    return {
      type: 'block',
      number: block.number,
      chainId: Number(this.chainId),
      hash: block.hash,
      parentHash: block.parentHash,
      timestamp: block.timestamp,
      events,
    };
  }

  private async fetchEvents(blockNumber: number): Promise<IndexedEvent[]> {
    const events: IndexedEvent[] = [];
    const watches = this.options.watch.events;

    if (watches.some((event) => event.type === 'erc20_transfer')) {
      events.push(...(await this.fetchERC20Transfers(blockNumber)));
    }

    if (watches.some((event) => event.type === 'native_transfer')) {
      events.push(...(await this.fetchNativeTransfers(blockNumber)));
    }

    return events;
  }

  private async fetchERC20Transfers(blockNumber: number): Promise<ERC20TransferEvent[]> {
    const logs = await withRetry(
      () =>
        this.client.getLogs({
          fromBlock: blockNumber,
          toBlock: blockNumber,
          address: this.watchedTokens.size > 0 ? [...this.watchedTokens] : undefined,
          topics: [ERC20_TRANSFER_TOPIC],
        }),
      this.config.retryPolicy.maxRetries,
      this.config.retryPolicy.delay,
    );

    const events: ERC20TransferEvent[] = [];

    for (const log of logs) {
      const event = decodeERC20Transfer(log);

      if (!event.ok) {
        throw new Error(event.error);
      }

      /*
       * Only emit transfers involving one
       * of the watched wallets.
       */
      if (
        !this.watchedAddresses.has(normalizeAddress(event.value.from)) &&
        !this.watchedAddresses.has(normalizeAddress(event.value.to))
      ) {
        continue;
      }

      events.push(event.value);
    }

    return events;
  }

  private async fetchNativeTransfers(blockNumber: number): Promise<NativeTransferEvent[]> {
    const traces = await withRetry(
      () => this.client.traceBlock(blockNumber),
      this.config.retryPolicy.maxRetries,
      this.config.retryPolicy.delay,
    );

    const events: NativeTransferEvent[] = [];

    for (let index = 0; index < traces.length; index++) {
      const trace = traces[index];

      if (!trace) {
        throw new Error(`Trace at index ${index} is undefined`);
      }

      if (trace.type !== 'call' || !trace.action) {
        continue;
      }

      const { from, to, value } = trace.action;

      if (!from || !to || !value) {
        continue;
      }

      const amount = BigInt(value);

      if (amount === 0n) {
        continue;
      }

      if (
        !this.watchedAddresses.has(normalizeAddress(from)) &&
        !this.watchedAddresses.has(normalizeAddress(to))
      ) {
        continue;
      }

      events.push({
        type: 'native_transfer',
        from,
        to,
        amount,
        transactionHash: trace.transactionHash ?? '',
        traceIndex: index,
      });
    }

    return events;
  }

  private async handleReorg(reorg: Reorg): Promise<void> {
    this.state = 'paused';

    if (!this.reorgHandler) {
      throw new Error(
        ['Chain reorganization detected', 'but no onReorg() handler is configured'].join(' '),
      );
    }

    const resolution = await this.reorgHandler(
      reorg,
      new ChainReaderImpl(this.client, this.chainId),
    );

    await this.resetTo(resolution.head);

    this.state = 'running';
  }

  private async resetTo(head: BlockReference): Promise<void> {
    // verify canonical head
    const canonical = await withRetry(
      () => this.client.getBlock(Number(head.number)),
      this.config.retryPolicy.maxRetries,
      this.config.retryPolicy.delay,
    );

    if (!canonical) {
      throw new Error(`Unable to verify block ${head.number}`);
    }

    if (normalizeHash(canonical.hash) !== normalizeHash(head.hash)) {
      throw new Error(
        [
          'Supplied reorg head is not canonical',
          `block: ${head.number}`,
          `expected: ${head.hash}`,
          `actual: ${canonical.hash}`,
        ].join('\n'),
      );
    }

    this.head = head;
  }

  private async wait(): Promise<void> {
    if (this.abortController.signal.aborted) {
      return;
    }

    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, this.options.interval);

      this.abortController.signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }
}
