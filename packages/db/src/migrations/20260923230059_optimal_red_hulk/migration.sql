DROP INDEX "transfers_to_chain_block_idx";--> statement-breakpoint
DROP INDEX "transfers_from_chain_block_idx";--> statement-breakpoint
DROP INDEX "transfers_token_chain_block_idx";--> statement-breakpoint
DROP INDEX "wallets_chain_address_idx";--> statement-breakpoint
CREATE INDEX "wallets_chain_address_idx" ON "wallets" ("address","chain_id");--> statement-breakpoint
CREATE INDEX "transfers_from_token_chain_block_idx" ON "transfers" ("from_address","token_address","chain_id","block_number");--> statement-breakpoint
CREATE INDEX "transfers_to_token_chain_block_idx" ON "transfers" ("to_address","token_address","chain_id","block_number");