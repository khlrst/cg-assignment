import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { findAllWalletsWithBalances } from '@cg-assignment/db';
import type { RuntimeEnv } from '@cg-assignment/db';
import { getConfig } from './env';

// uncomment for local development
// import dotenv from 'dotenv';
// dotenv.config();

const app = new Hono();

const config = getConfig();

app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

app.get('/wallets', async (c) => {
  const limitParam = c.req.query('limit');
  const cursorParam = c.req.query('cursor');

  const limit = limitParam ? Number.parseInt(limitParam, 10) : 1000;

  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    return c.json(
      {
        error: 'limit must be between 1 and 1000',
      },
      400,
    );
  }

  let cursor:
    | {
        address: string;
        chainId: number;
      }
    | undefined;

  if (cursorParam) {
    try {
      cursor = JSON.parse(Buffer.from(cursorParam, 'base64url').toString('utf8'));

      if (!cursor) {
        throw new Error('Invalid cursor');
      }

      if (typeof cursor.address !== 'string' || !Number.isInteger(cursor.chainId)) {
        throw new Error('Invalid cursor');
      }
    } catch {
      return c.json(
        {
          error: 'Invalid cursor',
        },
        400,
      );
    }
  }

  const result = await findAllWalletsWithBalances(config as RuntimeEnv, config.confirmations, {
    limit,
    cursor,
  });

  const nextCursor = result.nextCursor
    ? Buffer.from(JSON.stringify(result.nextCursor), 'utf8').toString('base64url')
    : null;

  return c.json({
    wallets: result.wallets,
    nextCursor,
  });
});

app.post('/withdrawals', async (c) => {
  const body = await c.req.json();

  if (typeof body.to !== 'string') {
    return c.json({ error: 'Invalid destination' }, 400);
  }

  if (typeof body.value !== 'string') {
    return c.json({ error: 'Invalid value' }, 400);
  }

  if (typeof body.asset !== 'string') {
    return c.json({ error: 'Invalid Asset' }, 400);
  }
});

serve({
  fetch: app.fetch,
  port: Number(config.port),
});
