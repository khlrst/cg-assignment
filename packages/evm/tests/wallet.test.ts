import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { ethers } from 'ethers';

import { buildWithdrawal, getWallet } from '../src/wallets';

const seedPhrase = 'test test test test test test test test test test test junk';

const rpcUrl = 'http://127.0.0.1:8545';
const chainId = 31337;

const recipient = '0x000000000000000000000000000000000000dEaD';
const token = '0x000000000000000000000000000000000000bEEF';

let anvil: ChildProcess | undefined;

before(async () => {
  anvil = spawn(
    'anvil',
    [
      '--host',
      '127.0.0.1',
      '--port',
      '8545',
      '--chain-id',
      String(chainId),
      '--mnemonic',
      seedPhrase,
      '--silent',
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  anvil.once('error', (error) => {
    throw new Error(
      `Failed to start Anvil. Is Foundry installed and is "anvil" on PATH? ${error.message}`,
    );
  });

  await waitForRpc(rpcUrl);
});

after(async () => {
  if (!anvil || anvil.killed) {
    return;
  }

  anvil.kill('SIGTERM');
  await waitForProcessExit(anvil);
});

describe('buildWithdrawal', () => {
  it('builds a signed native ETH transfer', async () => {
    const senderResult = getWallet(seedPhrase, 0);

    assert.equal(senderResult.ok, true);

    if (!senderResult.ok) {
      return;
    }

    const result = await buildWithdrawal(
      rpcUrl,
      seedPhrase,
      0,
      ethers.ZeroAddress,
      recipient,
      '1234567890000000000',
      false,
    );

    assert.equal(result.ok, true);

    if (!result.ok) {
      return;
    }

    const transaction = ethers.Transaction.from(result.value);

    assert.equal(transaction.isSigned(), true);
    assert.equal(transaction.chainId, BigInt(chainId));
    assert.equal(transaction.from?.toLowerCase(), senderResult.value.address.toLowerCase());
    assert.equal(transaction.to?.toLowerCase(), ethers.getAddress(recipient).toLowerCase());
    assert.equal(transaction.value, 1_234_567_890_000_000_000n);
    assert.equal(transaction.data, '0x');
    assert.ok(transaction.nonce >= 0);
    assert.ok(transaction.gasLimit > 0n);
  });

  it('builds a signed ERC-20 transfer with correct calldata', async () => {
    const senderResult = getWallet(seedPhrase, 1);

    assert.equal(senderResult.ok, true);

    if (!senderResult.ok) {
      return;
    }

    const amount = 987_654_321n;

    const result = await buildWithdrawal(
      rpcUrl,
      seedPhrase,
      1,
      token,
      recipient,
      amount.toString(),
      false,
    );

    assert.equal(result.ok, true);

    if (!result.ok) {
      return;
    }

    const transaction = ethers.Transaction.from(result.value);

    assert.equal(transaction.isSigned(), true);
    assert.equal(transaction.chainId, BigInt(chainId));
    assert.equal(transaction.from?.toLowerCase(), senderResult.value.address.toLowerCase());
    assert.equal(transaction.to?.toLowerCase(), ethers.getAddress(token).toLowerCase());
    assert.equal(transaction.value, 0n);

    const erc20 = new ethers.Interface(['function transfer(address to, uint256 amount)']);

    assert.equal(transaction.data.slice(0, 10), '0xa9059cbb');

    const decoded = erc20.decodeFunctionData('transfer', transaction.data);

    assert.equal(ethers.getAddress(decoded[0]), ethers.getAddress(recipient));
    assert.equal(decoded[1], amount);
  });

  it('uses the selected wallet index as the transaction sender', async () => {
    const wallet0 = getWallet(seedPhrase, 0);
    const wallet1 = getWallet(seedPhrase, 1);

    assert.equal(wallet0.ok, true);
    assert.equal(wallet1.ok, true);

    if (!wallet0.ok || !wallet1.ok) {
      return;
    }

    const result0 = await buildWithdrawal(
      rpcUrl,
      seedPhrase,
      0,
      ethers.ZeroAddress,
      recipient,
      '1',
      false,
    );

    const result1 = await buildWithdrawal(
      rpcUrl,
      seedPhrase,
      1,
      ethers.ZeroAddress,
      recipient,
      '1',
      false,
    );

    assert.equal(result0.ok, true);
    assert.equal(result1.ok, true);

    if (!result0.ok || !result1.ok) {
      return;
    }

    const transaction0 = ethers.Transaction.from(result0.value);
    const transaction1 = ethers.Transaction.from(result1.value);

    assert.equal(transaction0.from?.toLowerCase(), wallet0.value.address.toLowerCase());
    assert.equal(transaction1.from?.toLowerCase(), wallet1.value.address.toLowerCase());
    assert.notEqual(transaction0.from?.toLowerCase(), transaction1.from?.toLowerCase());
  });

  it('does not broadcast when broadcast is false', async () => {
    const senderResult = getWallet(seedPhrase, 0);

    assert.equal(senderResult.ok, true);

    if (!senderResult.ok) {
      return;
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);

    const nonceBefore = await provider.getTransactionCount(senderResult.value.address, 'latest');

    const balanceBefore = await provider.getBalance(recipient);

    const result = await buildWithdrawal(
      rpcUrl,
      seedPhrase,
      0,
      ethers.ZeroAddress,
      recipient,
      '1000000000000000',
      false,
    );

    assert.equal(result.ok, true);

    const nonceAfter = await provider.getTransactionCount(senderResult.value.address, 'latest');

    const balanceAfter = await provider.getBalance(recipient);

    assert.equal(nonceAfter, nonceBefore);
    assert.equal(balanceAfter, balanceBefore);
  });

  it('rejects an invalid wallet index', async () => {
    const result = await buildWithdrawal(
      rpcUrl,
      seedPhrase,
      20,
      ethers.ZeroAddress,
      recipient,
      '1',
      false,
    );

    assert.equal(result.ok, false);

    if (!result.ok) {
      assert.match(result.error, /wallet index/i);
    }
  });

  it('rejects an invalid asset address', async () => {
    const result = await buildWithdrawal(
      rpcUrl,
      seedPhrase,
      0,
      'not-an-address',
      recipient,
      '1',
      false,
    );

    assert.equal(result.ok, false);
  });

  it('rejects an invalid recipient address', async () => {
    const result = await buildWithdrawal(
      rpcUrl,
      seedPhrase,
      0,
      ethers.ZeroAddress,
      'not-an-address',
      '1',
      false,
    );

    assert.equal(result.ok, false);
  });

  it('rejects an invalid transfer value', async () => {
    const result = await buildWithdrawal(
      rpcUrl,
      seedPhrase,
      0,
      ethers.ZeroAddress,
      recipient,
      'not-a-number',
      false,
    );

    assert.equal(result.ok, false);
  });
});

describe('getWallet', () => {
  it('is deterministic', () => {
    const wallet1 = getWallet(seedPhrase, 0);
    const wallet2 = getWallet(seedPhrase, 0);

    assert.equal(wallet1.ok, true);
    assert.equal(wallet2.ok, true);

    assert.equal(wallet1.value.address, wallet2.value.address);
  });

  it('generates different wallets for different indexes', () => {
    const wallet1 = getWallet(seedPhrase, 0);
    const wallet2 = getWallet(seedPhrase, 1);

    assert.equal(wallet1.ok, true);
    assert.equal(wallet2.ok, true);

    assert.notEqual(wallet1.value.address, wallet2.value.address);
  });

  it('rejects invalid indexes', () => {
    const res1 = getWallet(seedPhrase, -1);
    const res2 = getWallet(seedPhrase, 20);
    assert.equal(res1.ok, false);
    assert.equal(res2.ok, false);
  });

  it('generates different wallets for different seeds', () => {
    const seedPhrase2 =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    const wallet1 = getWallet(seedPhrase, 0);
    const wallet2 = getWallet(seedPhrase2, 0);

    assert.equal(wallet1.ok, true);
    assert.equal(wallet2.ok, true);

    assert.notEqual(wallet1.value.address, wallet2.value.address);
  });
});

async function waitForRpc(url: string, timeoutMs = 10_000): Promise<void> {
  const provider = new ethers.JsonRpcProvider(url);
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const network = await provider.getNetwork();

      if (network.chainId === BigInt(chainId)) {
        return;
      }
    } catch {
      // Anvil has not accepted connections yet.
    }

    await sleep(100);
  }

  throw new Error(`Anvil did not start at ${url} within ${timeoutMs}ms`);
}

function waitForProcessExit(process: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    process.once('exit', () => resolve());
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
