/* eslint-disable no-console */
import {
  getWallet,
  getChainId,
  getBlockNumber,
  normalizeAddress,
  getWalletBalanceERC20,
} from '@cg-assignment/evm';
import { getDb, saveTokens, insertWallets } from '@cg-assignment/db';
import { getConfig } from './env';

async function seed() {
  const config = getConfig();

  const chainIdRes = await getChainId(config.rpcUrl);

  // Predeployed test token address
  // The choice is to use ERC20 token as not all providers will support 'trace_block'
  const tokenAddress = normalizeAddress('0x0af5e44f14f1531783afcfb4c5ff46f4921bd7ae');

  if (!chainIdRes.ok) {
    throw new Error(`Failed to get chain id: ${chainIdRes.error}`);
  }

  const chainId = chainIdRes.value;

  const blockNumberRes = await getBlockNumber(config.rpcUrl);
  if (!blockNumberRes.ok) {
    throw new Error(`Failed to get block number: ${blockNumberRes.error}`);
  }
  const latestBlockNumber = blockNumberRes.value.number;
  const latestBlockHash = blockNumberRes.value.hash;

  const wallets: { chainId: number; address: string; fromBlock: number; idx: number }[] = [];

  const balances: {
    wallet_address: string;
    chain_id: number;
    token_address: string;
    balance: bigint;
    at_block: number;
    at_hash: string;
  }[] = [];

  // save 20 wallets
  for (let i = 0; i < 20; i++) {
    const res = getWallet(config.mnemonic, i);
    if (!res.ok) {
      throw new Error(`Failed to get wallet ${i}: ${res.error}`);
    }
    wallets.push({
      chainId: chainId,
      address: normalizeAddress(res.value.address),
      fromBlock: latestBlockNumber,
      idx: i,
    });
    // NOTE: Ideally we should also query current wallets' balances for all of the tokens
    // but to save some time as this is the test task, I am only saving snapshot for our ERC20 token

    const balanceRes = await getWalletBalanceERC20(config.rpcUrl, res.value.address, tokenAddress);
    if (!balanceRes.ok) {
      throw new Error(`Failed to get balance for wallet ${i}: ${balanceRes.error}`);
    }

    balances.push({
      wallet_address: normalizeAddress(res.value.address),
      chain_id: chainId,
      token_address: tokenAddress,
      balance: balanceRes.value,
      at_block: latestBlockNumber,
      at_hash: latestBlockHash,
    });
  }

  const db = getDb({ DATABASE_URL: config.databaseUrl });
  await db.transaction(async (tx) => {
    // only index our ERC20 token
    await saveTokens(
      { DATABASE_URL: config.databaseUrl },
      { chain_id: chainId, address: tokenAddress },
      tx,
    );
    await insertWallets({ DATABASE_URL: config.databaseUrl }, wallets, balances, tx);
  });
}

seed();
