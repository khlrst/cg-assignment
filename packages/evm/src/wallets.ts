import type { TransactionLike, BaseContract } from 'ethers';
import { HDNodeWallet, Mnemonic, ethers } from 'ethers';
import type { Result } from '.';

export function getWallet(seedPhrase: string, idx: number): Result<HDNodeWallet> {
  try {
    if (!Number.isInteger(idx) || idx > 19) {
      throw new Error('Wallet index must be between 0 and 19');
    }

    const mnemonic = Mnemonic.fromPhrase(seedPhrase);

    return {
      ok: true,
      value: HDNodeWallet.fromMnemonic(mnemonic, `m/44'/60'/0'/0/${idx}`),
    };
  } catch (error) {
    return {
      ok: false,
      error: (error as Error).message,
    };
  }
}

export async function getChainId(rpcUrl: string): Promise<Result<number>> {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const chainId = await provider.getNetwork().then((n) => n.chainId);
    const chainIdNumber = Number(chainId);
    return { ok: true, value: chainIdNumber };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function getBlockNumber(
  rpcUrl: string,
): Promise<Result<{ number: number; hash: string }>> {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const blockNumber = await provider.getBlockNumber();
    const block = await provider.getBlock(blockNumber);
    if (!block || !block.hash) {
      return { ok: false, error: 'Block hash not found' };
    }
    return { ok: true, value: { number: blockNumber, hash: block.hash } };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function getWalletBalance(
  rpcUrl: string,
  walletAddress: string,
): Promise<Result<bigint>> {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const balance = await provider.getBalance(walletAddress);
    return { ok: true, value: balance };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

interface IERC20Contract extends BaseContract {
  balanceOf: (owner: string) => Promise<bigint>;
}

export async function getWalletBalanceERC20(
  rpcUrl: string,
  walletAddress: string,
  tokenAddress: string,
): Promise<Result<bigint>> {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const iface = new ethers.Interface([
      'function balanceOf(address owner) view returns (uint256)',
    ]);
    const contract = new ethers.Contract(
      tokenAddress,
      iface,
      provider,
    ) as unknown as IERC20Contract;
    const balance = await contract.balanceOf(walletAddress);
    return { ok: true, value: balance };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function buildWithdrawal(
  rpcUrl: string,
  seedPhrase: string,
  walletIdx: number,
  asset: string,
  to: string,
  value: string,
  broadcast = false,
): Promise<Result<string>> {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    const result = getWallet(seedPhrase, walletIdx);

    if (!result.ok) {
      return result;
    }

    const wallet = result.value.connect(provider);

    const normalizedAsset = ethers.getAddress(asset);
    const from = await wallet.getAddress();

    const transaction =
      normalizedAsset === ethers.ZeroAddress
        ? buildNativeTransfer(from, to, value)
        : buildERC20Transfer(normalizedAsset, to, value);

    if (!transaction.ok) {
      return transaction;
    }

    const populatedTransaction = await wallet.populateTransaction(transaction.value);

    const signedTransaction = await wallet.signTransaction(populatedTransaction);

    if (broadcast) {
      const txResponse = await provider.broadcastTransaction(signedTransaction);

      await txResponse.wait();
    }

    return {
      ok: true,
      value: signedTransaction,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to build withdrawal',
    };
  }
}

function buildNativeTransfer(from: string, to: string, value: string): Result<TransactionLike> {
  try {
    return {
      ok: true,
      value: {
        from: ethers.getAddress(from),
        to: ethers.getAddress(to),
        value: ethers.getBigInt(value),
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to build native transfer',
    };
  }
}

function buildERC20Transfer(token: string, to: string, value: string): Result<TransactionLike> {
  try {
    const normalizedToken = ethers.getAddress(token);
    const normalizedTo = ethers.getAddress(to);
    const normalizedValue = ethers.getBigInt(value);

    const iface = new ethers.Interface(['function transfer(address to, uint256 amount)']);

    return {
      ok: true,
      value: {
        to: normalizedToken,
        data: iface.encodeFunctionData('transfer', [normalizedTo, normalizedValue]),
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to build ERC20 transfer',
    };
  }
}
