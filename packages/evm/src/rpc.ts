import { Interface, JsonRpcProvider, type Log } from 'ethers';
import type { Abi } from 'abitype';
import type { Result } from '.';

export type BlockReference = {
  number: number;
  hash: string;
  chainId: number;
};

export type Reorg = {
  previousHead: BlockReference;
  newHead: BlockReference;
};

export type ReorgResolution = {
  type: 'reorg';
  // new head to resume from
  head: BlockReference;
};

export type ERC20TransferEvent = {
  type: 'erc20_transfer';
  token: string;
  from: string;
  to: string;
  amount: bigint;
  transactionHash: string;
  logIndex: number;
};

export type NativeTransferEvent = {
  type: 'native_transfer';
  from: string;
  to: string;
  amount: bigint;
  transactionHash: string;
  traceIndex: number;
};

export type IndexedEvent = ERC20TransferEvent | NativeTransferEvent;

export type IndexedBlock = {
  type: 'block';
  number: number;
  chainId: number;
  hash: string;
  parentHash: string;
  timestamp: number;
  events: IndexedEvent[];
};

export type Event = IndexedBlock | ReorgResolution;

export type ERC20TransferWatch = {
  type: 'erc20_transfer';
  // If mitted or empty, all ERC20 contracts are watched.
  tokens?: string[];
};

export type NativeTransferWatch = {
  type: 'native_transfer';
};

export type EventWatch = ERC20TransferWatch | NativeTransferWatch;

export type LogFilter = {
  fromBlock: number;
  toBlock: number;
  address?: string[];
  topics?: Array<string | string[] | null>;
};

export type TraceAction = {
  callType?: string;
  from?: string;
  to?: string;
  value?: string;
  input?: string;
};

export type Trace = {
  type: string;
  action?: TraceAction;
  transactionHash?: string;
  traceAddress?: number[];
};

const erc20Abi = [
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      {
        name: 'from',
        type: 'address',
        indexed: true,
      },
      {
        name: 'to',
        type: 'address',
        indexed: true,
      },
      {
        name: 'value',
        type: 'uint256',
        indexed: false,
      },
    ],
  },
] as const satisfies Abi;

export const erc20Interface = new Interface(erc20Abi);

const transferEvent = erc20Interface.getEvent('Transfer');

if (!transferEvent) {
  throw new Error('ERC20 Transfer event is missing from ABI');
}

export const ERC20_TRANSFER_TOPIC = transferEvent.topicHash;

export function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

export function normalizeHash(hash: string): string {
  return hash.toLowerCase();
}

export function decodeERC20Transfer(log: Log): Result<ERC20TransferEvent> {
  try {
    const decoded = erc20Interface.parseLog({
      topics: [...log.topics],
      data: log.data,
    });

    if (!decoded) {
      return {
        ok: false,
        error: `Unable to decode ERC20 Transfer log ${log.transactionHash}`,
      };
    }

    return {
      ok: true,
      value: {
        type: 'erc20_transfer',
        token: log.address,
        from: decoded.args[0],
        to: decoded.args[1],
        amount: decoded.args[2],
        transactionHash: log.transactionHash,
        logIndex: log.index,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to decode ERC20 transfer',
    };
  }
}

export type BlockchainBlock = {
  number: number;
  hash: string;
  parentHash: string;
  timestamp: number;
};

export interface ChainReader {
  getBlock(number: bigint): Promise<BlockReference | null>;
}

export type ReorgHandler = (reorg: Reorg, chain: ChainReader) => Promise<ReorgResolution>;
export type BlockHandler = (block: IndexedBlock) => Promise<void>;

export interface BlockchainClient {
  getBlockNumber(): Promise<number>;
  getBlock(blockNumber: number): Promise<BlockchainBlock | null>;
  getLogs(filter: LogFilter): Promise<Log[]>;
  // Requires an RPC provider supporting trace_block.
  traceBlock(blockNumber: number): Promise<Trace[]>;
  getChainId(): Promise<bigint>;
}

export class ChainReaderImpl implements ChainReader {
  constructor(
    private readonly client: BlockchainClient,
    private readonly chainId: bigint,
  ) {}

  async getBlock(number: bigint): Promise<BlockReference | null> {
    const block = await this.client.getBlock(Number(number));

    if (!block) {
      return null;
    }

    return {
      chainId: Number(this.chainId),
      number: block.number,
      hash: block.hash,
    };
  }
}

export class EVMBlockchainClient implements BlockchainClient {
  private readonly provider: JsonRpcProvider;

  constructor(rpc: string) {
    this.provider = new JsonRpcProvider(rpc);
  }

  async getBlockNumber(): Promise<number> {
    return this.provider.getBlockNumber();
  }

  async getBlock(blockNumber: number): Promise<BlockchainBlock | null> {
    const block = await this.provider.getBlock(blockNumber);

    if (!block) {
      return null;
    }

    // make sure block is not pending
    if (!block.hash) {
      return null;
    }

    return {
      number: block.number,
      hash: block.hash,
      parentHash: block.parentHash,
      timestamp: block.timestamp,
    };
  }

  async getLogs(filter: LogFilter): Promise<Log[]> {
    return this.provider.getLogs({
      fromBlock: filter.fromBlock,
      toBlock: filter.toBlock,
      address: filter.address,
      topics: filter.topics,
    });
  }

  async traceBlock(blockNumber: number): Promise<Trace[]> {
    return this.provider.send('trace_block', [`0x${blockNumber.toString(16)}`]) as Promise<Trace[]>;
  }

  async getChainId(): Promise<bigint> {
    return (await this.provider.getNetwork()).chainId;
  }
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  retries = 3,
  delayMs = 500,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === retries) {
        break;
      }

      await sleep(delayMs);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
