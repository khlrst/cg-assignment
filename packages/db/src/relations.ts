import { defineRelations } from 'drizzle-orm';
import * as schema from './schema';

// fields: [transfers.chain_id],
// references: [blocks.number],

export const relations = defineRelations(schema, (r) => ({
  blocks: { transfers: r.many.transfers() },
  transfers: {
    blocks: r.one.blocks({
      from: r.transfers.block_hash,
      to: r.blocks.hash,
    }),
  },
  wallets: { balances: r.many.balances() },
  tokens: { balances: r.many.balances() },
  balances: {
    wallet: r.one.wallets({
      from: r.balances.wallet_address,
      to: r.wallets.address,
    }),
    token: r.one.tokens({
      from: [r.balances.token_address, r.balances.chain_id],
      to: [r.tokens.address, r.tokens.chain_id],
    }),
  },
}));
