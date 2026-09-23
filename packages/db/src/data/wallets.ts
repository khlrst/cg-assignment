import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb } from '../';
import type { RuntimeEnv } from '../env';
import { wallets, balances, transfers, blocks, tokens } from '../schema';
import type { DatabaseClient } from '../';

export type Balance = {
  token: string;
  chainId: number;
  confirmedBalance: string;
  unconfirmedBalance: string;
};

export type WalletWithBalances = {
  address: string;
  chainId: number;
  balances: Balance[];
};

export type WalletBalanceCursor = {
  address: string;
  chainId: number;
};

export type FindAllWalletsWithBalancesOptions = {
  limit?: number;
  cursor?: WalletBalanceCursor;
};

export type FindAllWalletsWithBalancesResult = {
  wallets: WalletWithBalances[];
  nextCursor: WalletBalanceCursor | null;
};

const MAX_PAGE_SIZE = 1000;

export async function getWalletWithTokenBalance(
  env: RuntimeEnv,
  walletAddress: string,
  tokenAddress: string,
  chainId: number,
  safeRange: number,
): Promise<Balance | null> {
  if (!Number.isInteger(safeRange) || safeRange < 0) {
    throw new Error('safeRange must be a non-negative integer');
  }

  const db = getDb(env);

  const result = await db.execute(sql`
    WITH latest_block AS (
      SELECT
        b.number,
        b.hash
      FROM ${blocks} b
      WHERE b.chain_id = ${chainId}
      ORDER BY b.number DESC
      LIMIT 1
    ),

    safe_block AS (
      SELECT
        b.number,
        b.hash
      FROM ${blocks} b
      CROSS JOIN latest_block lb
      WHERE
        b.chain_id = ${chainId}
        AND b.number <= lb.number - ${safeRange}
      ORDER BY b.number DESC
      LIMIT 1
    ),

    wallet_info AS (
      SELECT
        w.address,
        w.chain_id,
        w.from_block
      FROM ${wallets} w
      WHERE
        w.address = ${walletAddress}
        AND w.chain_id = ${chainId}
      LIMIT 1
    ),

    token_info AS (
      SELECT
        t.address,
        t.chain_id
      FROM ${tokens} t
      WHERE
        t.address = ${tokenAddress}
        AND t.chain_id = ${chainId}
      LIMIT 1
    ),

    snapshot AS (
      SELECT
        b.balance,
        b.at_block
      FROM ${balances} b
      WHERE
        b.wallet_address = ${walletAddress}
        AND b.chain_id = ${chainId}
        AND b.token_address = ${tokenAddress}
      LIMIT 1
    ),

    calculation AS (
      SELECT
        wi.address,
        wi.chain_id,
        ti.address AS token_address,

        COALESCE(
          s.balance,
          0
        )
        +
        COALESCE(
          SUM(
            CASE
              WHEN t.block_number <= sb.number
              THEN
                CASE
                  WHEN t.to_address = wi.address
                    THEN t.value
                  ELSE 0
                END
                -
                CASE
                  WHEN t.from_address = wi.address
                    THEN t.value
                  ELSE 0
                END
              ELSE 0
            END
          ),
          0
        ) AS confirmed_balance,

        COALESCE(
          s.balance,
          0
        )
        +
        COALESCE(
          SUM(
            CASE
              WHEN t.block_number <= lb.number
              THEN
                CASE
                  WHEN t.to_address = wi.address
                    THEN t.value
                  ELSE 0
                END
                -
                CASE
                  WHEN t.from_address = wi.address
                    THEN t.value
                  ELSE 0
                END
              ELSE 0
            END
          ),
          0
        ) AS unconfirmed_balance

      FROM wallet_info wi

      INNER JOIN token_info ti
        ON ti.chain_id = wi.chain_id

      CROSS JOIN latest_block lb
      CROSS JOIN safe_block sb

      LEFT JOIN snapshot s
        ON true

      LEFT JOIN ${transfers} t
        ON t.chain_id = wi.chain_id
        AND t.token_address = ti.address
        AND (
          t.from_address = wi.address
          OR
          t.to_address = wi.address
        )
        AND t.block_number >
          COALESCE(
            s.at_block,
            wi.from_block - 1
          )
        AND t.block_number <= lb.number

      GROUP BY
        wi.address,
        wi.chain_id,
        wi.from_block,
        ti.address,
        s.balance,
        s.at_block
    )

    SELECT
      token_address::text AS token,
      chain_id,
      confirmed_balance::text AS confirmed_balance,
      unconfirmed_balance::text AS unconfirmed_balance
    FROM calculation
  `);

  const row = result.rows[0] as
    | {
        token: string;
        chain_id: number;
        confirmed_balance: string;
        unconfirmed_balance: string;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    token: row.token,
    chainId: row.chain_id,
    confirmedBalance: row.confirmed_balance,
    unconfirmedBalance: row.unconfirmed_balance,
  };
}

export async function findAllWalletsWithBalances(
  env: RuntimeEnv,
  safeRange: number,
  options: FindAllWalletsWithBalancesOptions = {},
): Promise<FindAllWalletsWithBalancesResult> {
  if (!Number.isInteger(safeRange) || safeRange < 0) {
    throw new Error('safeRange must be a non-negative integer');
  }

  const requestedLimit = options.limit ?? 100;

  if (!Number.isInteger(requestedLimit) || requestedLimit <= 0) {
    throw new Error('limit must be a positive integer');
  }

  const limit = Math.min(requestedLimit, MAX_PAGE_SIZE);

  const cursorAddress = options.cursor?.address ?? null;

  const cursorChainId = options.cursor?.chainId ?? null;

  const db = getDb(env);

  const result = await db.execute(sql`
    WITH wallet_page AS (
      SELECT
        w.address,
        w.chain_id,
        w.from_block
      FROM ${wallets} w
      WHERE
        (
          ${cursorAddress}::char(42) IS NULL
          OR
          w.address > ${cursorAddress}
          OR (
            w.address = ${cursorAddress}
            AND w.chain_id > ${cursorChainId}
          )
        )
      ORDER BY
        w.address ASC,
        w.chain_id ASC
      LIMIT ${limit + 1}
    ),

    /*
     * Latest block for every chain represented in this page.
     */
    latest_blocks AS (
      SELECT DISTINCT ON (b.chain_id)
        b.chain_id,
        b.number,
        b.hash
      FROM ${blocks} b
      INNER JOIN (
        SELECT DISTINCT chain_id
        FROM wallet_page
      ) chains
        ON chains.chain_id = b.chain_id
      ORDER BY
        b.chain_id,
        b.number DESC
    ),

    /*
     * Latest block minus safeRange.
     */
    safe_blocks AS (
      SELECT DISTINCT ON (b.chain_id)
        b.chain_id,
        b.number,
        b.hash
      FROM ${blocks} b
      INNER JOIN latest_blocks lb
        ON lb.chain_id = b.chain_id
      WHERE
        b.number <= lb.number - ${safeRange}
      ORDER BY
        b.chain_id,
        b.number DESC
    ),

    /*
     * Existing snapshots.
     */
    snapshot_pairs AS (
      SELECT
        wp.address,
        wp.chain_id,
        wp.from_block,
        b.token_address,
        b.balance AS snapshot_balance,
        b.at_block AS snapshot_block
      FROM wallet_page wp
      INNER JOIN ${balances} b
        ON b.wallet_address = wp.address
        AND b.chain_id = wp.chain_id
    ),

    /*
     * Wallet/token combinations which do not have a snapshot yet.
     *
     * These are discovered from transfers starting at wallet.from_block.
     */
    new_pairs AS (
      SELECT DISTINCT
        wp.address,
        wp.chain_id,
        wp.from_block,
        t.token_address
      FROM wallet_page wp

      INNER JOIN ${transfers} t
        ON t.chain_id = wp.chain_id
        AND (
          t.from_address = wp.address
          OR
          t.to_address = wp.address
        )
        AND t.block_number >= wp.from_block

      INNER JOIN ${tokens} tok
        ON tok.address = t.token_address
        AND tok.chain_id = t.chain_id

      LEFT JOIN ${balances} b
        ON b.wallet_address = wp.address
        AND b.chain_id = wp.chain_id
        AND b.token_address = t.token_address

      WHERE b.wallet_address IS NULL
    ),

    /*
     * Existing snapshots plus new wallet/token combinations.
     */
    candidate_pairs AS (
      SELECT
        address,
        chain_id,
        from_block,
        token_address,
        snapshot_balance,
        snapshot_block
      FROM snapshot_pairs

      UNION ALL

      SELECT
        address,
        chain_id,
        from_block,
        token_address,
        NULL::numeric AS snapshot_balance,
        NULL::integer AS snapshot_block
      FROM new_pairs
    ),

    /*
     * Aggregate transfers once per wallet/token.
     *
     * Existing snapshot:
     *
     *   start = snapshot_block
     *
     * New pair:
     *
     *   start = from_block - 1
     */
    aggregated AS (
      SELECT
        cp.address,
        cp.chain_id,
        cp.token_address,

        COALESCE(
          cp.snapshot_balance,
          0
        )
        +
        COALESCE(
          SUM(
            CASE
              WHEN t.block_number <= sb.number
              THEN
                CASE
                  WHEN t.to_address = cp.address
                    THEN t.value
                  ELSE 0
                END
                -
                CASE
                  WHEN t.from_address = cp.address
                    THEN t.value
                  ELSE 0
                END
              ELSE 0
            END
          ),
          0
        ) AS confirmed_balance,

        COALESCE(
          cp.snapshot_balance,
          0
        )
        +
        COALESCE(
          SUM(
            CASE
              WHEN t.block_number <= lb.number
              THEN
                CASE
                  WHEN t.to_address = cp.address
                    THEN t.value
                  ELSE 0
                END
                -
                CASE
                  WHEN t.from_address = cp.address
                    THEN t.value
                  ELSE 0
                END
              ELSE 0
            END
          ),
          0
        ) AS unconfirmed_balance

      FROM candidate_pairs cp

      INNER JOIN latest_blocks lb
        ON lb.chain_id = cp.chain_id

      INNER JOIN safe_blocks sb
        ON sb.chain_id = cp.chain_id

      LEFT JOIN ${transfers} t
        ON t.chain_id = cp.chain_id
        AND t.token_address = cp.token_address
        AND (
          t.from_address = cp.address
          OR
          t.to_address = cp.address
        )
        AND t.block_number >
          COALESCE(
            cp.snapshot_block,
            cp.from_block - 1
          )
        AND t.block_number <= lb.number

      GROUP BY
        cp.address,
        cp.chain_id,
        cp.token_address,
        cp.snapshot_balance
    ),

    /*
     * Convert token rows into the API shape.
     */
    wallet_balances AS (
      SELECT
        a.address,
        a.chain_id,

        jsonb_agg(
          jsonb_build_object(
            'token',
            a.token_address,

            'chainId',
            a.chain_id,

            'confirmedBalance',
            a.confirmed_balance::text,

            'unconfirmedBalance',
            a.unconfirmed_balance::text
          )
          ORDER BY
            a.chain_id,
            a.token_address
        ) AS balances

      FROM aggregated a

      GROUP BY
        a.address,
        a.chain_id
    )

    SELECT
      wp.address,
      wp.chain_id,

      COALESCE(
        wb.balances,
        '[]'::jsonb
      ) AS balances

    FROM wallet_page wp

    LEFT JOIN wallet_balances wb
      ON wb.address = wp.address
      AND wb.chain_id = wp.chain_id

    ORDER BY
      wp.address ASC,
      wp.chain_id ASC
  `);

  const rows = result.rows as Array<{
    address: string;
    chain_id: number;
    balances: Balance[];
  }>;

  const hasNextPage = rows.length > limit;

  const pageRows = hasNextPage ? rows.slice(0, limit) : rows;

  if (pageRows.length === 0) {
    return {
      wallets: [],
      nextCursor: null,
    };
  }

  const last = pageRows[pageRows.length - 1];

  if (!last) {
    return {
      wallets: [],
      nextCursor: null,
    };
  }

  return {
    wallets: pageRows.map((row) => ({
      address: row.address,
      chainId: row.chain_id,
      balances: row.balances,
    })),

    nextCursor: hasNextPage
      ? {
          address: last.address,
          chainId: last.chain_id,
        }
      : null,
  };
}

export async function updateBalancesSnapshot(
  env: RuntimeEnv,
  chainId: number,
  safeRange: number,
  tx?: DatabaseClient,
): Promise<void> {
  if (!Number.isInteger(chainId) || chainId < 0) {
    throw new Error('chainId must be a non-negative integer');
  }

  if (!Number.isInteger(safeRange) || safeRange < 0) {
    throw new Error('safeRange must be a non-negative integer');
  }

  const db = tx || getDb(env);

  await db.execute(sql`
    WITH latest_block AS (
      SELECT
        b.number AS latest_number
      FROM ${blocks} b
      WHERE b.chain_id = ${chainId}
      ORDER BY b.number DESC
      LIMIT 1
    ),

    safe_block AS (
      SELECT
        b.chain_id,
        b.number AS safe_number,
        b.hash AS safe_hash
      FROM ${blocks} b
      INNER JOIN latest_block lb
        ON b.number <= lb.latest_number - ${safeRange}
      WHERE b.chain_id = ${chainId}
      ORDER BY b.number DESC
      LIMIT 1
    ),

    deltas AS (
      SELECT
        bal.wallet_address,
        bal.chain_id,
        bal.token_address,

        sb.safe_number,
        sb.safe_hash,

        COALESCE(
          SUM(
            CASE
              WHEN t.to_address = bal.wallet_address
              THEN t.value
              ELSE 0
            END
            -
            CASE
              WHEN t.from_address = bal.wallet_address
              THEN t.value
              ELSE 0
            END
          ),
          0
        ) AS delta

      FROM ${balances} bal

      INNER JOIN safe_block sb
        ON sb.chain_id = bal.chain_id

      LEFT JOIN ${transfers} t
        ON t.chain_id = bal.chain_id
        AND t.token_address = bal.token_address
        AND t.block_number > bal.at_block
        AND t.block_number <= sb.safe_number
        AND (
          t.from_address = bal.wallet_address
          OR
          t.to_address = bal.wallet_address
        )

      WHERE
        bal.chain_id = ${chainId}
        AND bal.at_block < sb.safe_number

      GROUP BY
        bal.wallet_address,
        bal.chain_id,
        bal.token_address,
        sb.safe_number,
        sb.safe_hash
    )

    UPDATE ${balances} bal
    SET
      balance = bal.balance + d.delta,
      at_block = d.safe_number,
      at_hash = d.safe_hash

    FROM deltas d

    WHERE
      bal.wallet_address = d.wallet_address
      AND bal.chain_id = d.chain_id
      AND bal.token_address = d.token_address
  `);

  await db.execute(sql`
    WITH latest_block AS (
      SELECT
        b.number AS latest_number
      FROM ${blocks} b
      WHERE b.chain_id = ${chainId}
      ORDER BY b.number DESC
      LIMIT 1
    ),

    safe_block AS (
      SELECT
        b.chain_id,
        b.number AS safe_number,
        b.hash AS safe_hash
      FROM ${blocks} b
      INNER JOIN latest_block lb
        ON b.number <= lb.latest_number - ${safeRange}
      WHERE b.chain_id = ${chainId}
      ORDER BY b.number DESC
      LIMIT 1
    ),

    new_pairs AS (
      SELECT
        w.address AS wallet_address,
        w.chain_id,
        t.token_address,

        sb.safe_number,
        sb.safe_hash,

        COALESCE(
          SUM(
            CASE
              WHEN t.to_address = w.address
              THEN t.value
              ELSE 0
            END
            -
            CASE
              WHEN t.from_address = w.address
              THEN t.value
              ELSE 0
            END
          ),
          0
        ) AS balance

      FROM ${wallets} w

      INNER JOIN safe_block sb
        ON sb.chain_id = w.chain_id

      INNER JOIN ${transfers} t
        ON t.chain_id = w.chain_id
        AND (
          t.from_address = w.address
          OR
          t.to_address = w.address
        )
        AND t.block_number >= w.from_block
        AND t.block_number <= sb.safe_number

      INNER JOIN ${tokens} tok
        ON tok.address = t.token_address
        AND tok.chain_id = t.chain_id

      LEFT JOIN ${balances} existing
        ON existing.wallet_address = w.address
        AND existing.chain_id = w.chain_id
        AND existing.token_address = t.token_address

      WHERE
        w.chain_id = ${chainId}
        AND existing.wallet_address IS NULL

      GROUP BY
        w.address,
        w.chain_id,
        t.token_address,
        sb.safe_number,
        sb.safe_hash
    )

    INSERT INTO ${balances} (
      wallet_address,
      chain_id,
      token_address,
      balance,
      at_block,
      at_hash,
      version
    )
    SELECT
      wallet_address,
      chain_id,
      token_address,
      balance,
      safe_number,
      safe_hash,
      1
    FROM new_pairs

    ON CONFLICT (
      wallet_address,
      chain_id,
      token_address
    )
    DO NOTHING
  `);
}

export async function getAllWallets(
  env: RuntimeEnv,
): Promise<Array<{ address: string; chainId: number; fromBlock: number }>> {
  const db = getDb(env);

  const result = await db
    .select({
      address: wallets.address,
      chainId: wallets.chain_id,
      fromBlock: wallets.from_block,
    })
    .from(wallets)
    .orderBy(asc(wallets.address), asc(wallets.chain_id));

  return result;
}

export async function getAllWalletsByChainId(
  env: RuntimeEnv,
  chainId: number,
): Promise<Array<{ address: string; chainId: number; fromBlock: number }>> {
  const db = getDb(env);

  const result = await db
    .select({
      address: wallets.address,
      chainId: wallets.chain_id,
      fromBlock: wallets.from_block,
    })
    .from(wallets)
    .where(eq(wallets.chain_id, chainId));

  return result;
}

export async function getWallet(
  env: RuntimeEnv,
  walletAddress: string,
  chainId: number,
): Promise<{
  address: string;
  chainId: number;
  fromBlock: number;
  idx: number;
} | null> {
  const db = getDb(env);

  const result = await db
    .select({
      address: wallets.address,
      chainId: wallets.chain_id,
      fromBlock: wallets.from_block,
      idx: wallets.idx,
    })
    .from(wallets)
    .where(and(eq(wallets.address, walletAddress), eq(wallets.chain_id, chainId)))
    .limit(1);

  return result[0] ?? null;
}

export async function insertWallets(
  env: RuntimeEnv,
  walletList: Array<{ address: string; chainId: number; fromBlock: number; idx: number }>,
  tx?: DatabaseClient,
): Promise<void> {
  const db = tx || getDb(env);

  return await db.transaction(async (tx) => {
    if (walletList.length === 0) {
      return;
    }

    await tx
      .insert(wallets)
      .values(
        walletList.map((wallet) => ({
          address: wallet.address,
          chain_id: wallet.chainId,
          from_block: wallet.fromBlock,
          idx: wallet.idx,
        })),
      )
      .onConflictDoNothing();
  });
}
