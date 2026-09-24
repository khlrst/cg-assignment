import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';

import {
  findAllWalletsWithBalances,
  getTokenBalanceByWallet,
  getWallet,
} from '@cg-assignment/db';
import type { RuntimeEnv } from '@cg-assignment/db';

import {
  buildWithdrawal,
  getChainId,
  normalizeAddress,
} from '@cg-assignment/evm';

import { getConfig } from './env';

// Uncomment for local development
// import dotenv from 'dotenv';
// dotenv.config();

const walletQuerySchema = z.object({
  address: z.string().min(42, 'Invalid destination'),
  token: z.string().min(42, 'Invalid value'),
});

const walletsQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 1000))
    .refine((num) => !Number.isNaN(num) && num >= 1 && num <= 1000, {
      message: 'limit must be between 1 and 1000',
    }),

  cursor: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) {
        return undefined;
      }

      try {
        const parsed = JSON.parse(
          Buffer.from(val, 'base64url').toString('utf8'),
        );

        const cursorSchema = z.object({
          address: z.string().min(1),
          chainId: z.number().int().positive(),
        });

        return cursorSchema.parse(parsed);
      } catch {
        throw new Error('Invalid cursor');
      }
    }),
});

const withdrawalBodySchema = z.object({
  to: z.string().min(42, 'Invalid destination'),
  from: z.string().min(42, 'Invalid sender'),
  value: z.string().min(1, 'Invalid value'),
  asset: z.string().min(42, 'Invalid Asset'),
  broadcast: z.boolean().optional().default(false),
});

const app = new Hono();

const config = getConfig();

app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

app.get(
  '/wallet',
  zValidator('query', walletQuerySchema),
  async (c) => {
    const { address, token } = c.req.valid('query');

    const chainId = await getChainId(config.rpcUrl);

    if (!chainId.ok) {
      return c.json({ error: chainId.error }, 400);
    }

    const result = await getTokenBalanceByWallet(
      config as RuntimeEnv,
      normalizeAddress(address),
      normalizeAddress(token),
      chainId.value,
      config.confirmations,
    );

    if (!result) {
      return c.json({ error: 'Balance not found' }, 404);
    }

    return c.json({
      wallet: result,
    });
  },
);

app.get(
  '/wallets',
  zValidator('query', walletsQuerySchema),
  async (c) => {
    const { limit, cursor } = c.req.valid('query');

    const result = await findAllWalletsWithBalances(
      config as RuntimeEnv,
      config.confirmations,
      {
        limit,
        cursor,
      },
    );

    const nextCursor = result.nextCursor
      ? Buffer.from(
          JSON.stringify(result.nextCursor),
          'utf8',
        ).toString('base64url')
      : null;

    return c.json({
      wallets: result.wallets,
      nextCursor,
    });
  },
);

app.post(
  '/withdrawals',
  zValidator('json', withdrawalBodySchema),
  async (c) => {
    const body = c.req.valid('json');

    const chainId = await getChainId(config.rpcUrl);

    if (!chainId.ok) {
      return c.json({ error: chainId.error }, 400);
    }

    const walletRes = await getWallet(
      { DATABASE_URL: config.databaseUrl } as RuntimeEnv,
      normalizeAddress(body.from),
      chainId.value,
    );

    if (!walletRes) {
      return c.json({ error: 'Wallet not found' }, 404);
    }

    const balance = await getTokenBalanceByWallet(
      { DATABASE_URL: config.databaseUrl } as RuntimeEnv,
      normalizeAddress(body.from),
      normalizeAddress(body.asset),
      chainId.value,
      config.confirmations,
    );

    if (!balance) {
      return c.json({ error: 'Balance not found' }, 404);
    }

    if (BigInt(balance.confirmedBalance) < BigInt(body.value)) {
      return c.json(
        { error: 'Insufficient confirmed balance' },
        400,
      );
    }

    const result = await buildWithdrawal(
      config.rpcUrl,
      config.mnemonic,
      walletRes.idx,
      body.asset,
      body.to,
      body.value,
      body.broadcast,
    );

    if (!result.ok) {
      return c.json({ error: result.error }, 400);
    }

    return c.json({
      transaction: result.value,
    });
  },
);

serve({
  fetch: app.fetch,
  port: Number(config.port),
});
