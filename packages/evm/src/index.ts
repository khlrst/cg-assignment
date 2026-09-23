import { ethers } from 'ethers';

export * from './wallets';

export type Result<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: string;
    };

export const ZeroAddress = ethers.ZeroAddress;
