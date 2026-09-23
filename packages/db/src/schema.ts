import {
  pgTable,
  text,
  timestamp,
  foreignKey,
  integer,
  boolean,
  primaryKey,
  char,
  numeric,
  index,
} from 'drizzle-orm/pg-core';

export const wallets = pgTable(
  'wallets',
  {
    address: char('address', { length: 42 }).notNull(),
    chain_id: integer('chain_id').notNull(),
    from_block: integer('from_block').notNull(),
    idx: integer('idx').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.address, table.chain_id],
      name: 'wallets_pkey',
    }),
    index('wallets_chain_address_idx').on(table.address, table.chain_id),
  ],
);

export const tokens = pgTable(
  'tokens',
  {
    address: char('address', { length: 42 }).notNull(),
    chain_id: integer('chain_id').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.address, table.chain_id],
      name: 'tokens_pkey',
    }),
  ],
);

export const blocks = pgTable(
  'blocks',
  {
    chain_id: integer('chain_id').notNull(),
    hash: char('hash', { length: 66 }).notNull(),
    number: integer('number').notNull(),
    timestamp: timestamp('timestamp', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
    parent_hash: char('parent_hash', { length: 66 }).notNull(),
    finished: boolean('finished').default(false).notNull(),
    version: integer('version').default(1).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.chain_id, table.hash],
      name: 'blocks_pkey',
    }),
    index('blocks_chain_number_idx').on(table.chain_id, table.number),
  ],
);

export const transfers = pgTable(
  'transfers',
  {
    // composite id chain_id:block_hash:index, where index is trace or log indices
    id: text('id').primaryKey().notNull(),
    chain_id: integer('chain_id').notNull(),
    block_number: integer('block_number').notNull(),
    block_hash: char('block_hash', { length: 66 }).notNull(),
    token_address: char('token_address', { length: 42 }).notNull(),
    from_address: char('from_address', { length: 42 }).notNull(),
    to_address: char('to_address', { length: 42 }).notNull(),
    value: numeric('value', { precision: 78, scale: 0 }).notNull(),
    index: integer('index').notNull(),
    version: integer('version').default(1).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.chain_id, table.block_hash],
      foreignColumns: [blocks.chain_id, blocks.hash],
      name: 'fk_chain_id_block',
    }).onDelete('cascade'),
    index('transfers_from_token_chain_block_idx').on(
      table.from_address,
      table.token_address,
      table.chain_id,
      table.block_number,
    ),
    index('transfers_to_token_chain_block_idx').on(
      table.to_address,
      table.token_address,
      table.chain_id,
      table.block_number,
    ),
  ],
);

export const balances = pgTable(
  'balances',
  {
    wallet_address: char('wallet_address', { length: 42 }).notNull(),
    chain_id: integer('chain_id').notNull(),
    token_address: char('token_address', { length: 42 }).notNull(),
    balance: numeric('balance', { precision: 78, scale: 0 }).notNull().default('0'),
    at_block: integer('at_block').notNull(),
    at_hash: char('at_hash', { length: 66 }).notNull(),
    version: integer('version').default(1).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.wallet_address, table.chain_id, table.token_address],
      name: 'balances_pkey',
    }),
    foreignKey({
      columns: [table.wallet_address, table.chain_id],
      foreignColumns: [wallets.address, wallets.chain_id],
      name: 'fk_wallet_chain',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.token_address, table.chain_id],
      foreignColumns: [tokens.address, tokens.chain_id],
      name: 'fk_token_address_chain_id',
    }).onDelete('cascade'),
    index('balances_chain_block_idx').on(table.chain_id, table.at_block),
  ],
);
