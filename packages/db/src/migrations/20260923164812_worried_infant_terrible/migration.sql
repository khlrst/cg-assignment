CREATE TABLE "balances" (
	"wallet_address" char(42),
	"chain_id" integer,
	"token_address" char(42),
	"balance" numeric(78,0) DEFAULT '0' NOT NULL,
	"at_block" integer NOT NULL,
	"at_hash" char(66) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "balances_pkey" PRIMARY KEY("wallet_address","chain_id","token_address")
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"chain_id" integer,
	"hash" char(66),
	"number" integer NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"parent_hash" char(66) NOT NULL,
	"finished" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "blocks_pkey" PRIMARY KEY("chain_id","hash")
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"address" char(42),
	"chain_id" integer,
	CONSTRAINT "tokens_pkey" PRIMARY KEY("address","chain_id")
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" text PRIMARY KEY,
	"chain_id" integer NOT NULL,
	"block_number" integer NOT NULL,
	"block_hash" char(66) NOT NULL,
	"token_address" char(42) NOT NULL,
	"from_address" char(42) NOT NULL,
	"to_address" char(42) NOT NULL,
	"value" numeric(78,0) NOT NULL,
	"index" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"address" char(42),
	"chain_id" integer,
	"from_block" integer NOT NULL,
	"idx" integer NOT NULL,
	CONSTRAINT "wallets_pkey" PRIMARY KEY("address","chain_id")
);
--> statement-breakpoint
CREATE INDEX "balances_chain_block_idx" ON "balances" ("chain_id","at_block");--> statement-breakpoint
CREATE INDEX "blocks_chain_number_idx" ON "blocks" ("chain_id","number");--> statement-breakpoint
CREATE INDEX "transfers_to_chain_block_idx" ON "transfers" ("to_address","chain_id","block_number");--> statement-breakpoint
CREATE INDEX "transfers_from_chain_block_idx" ON "transfers" ("from_address","chain_id","block_number");--> statement-breakpoint
CREATE INDEX "transfers_token_chain_block_idx" ON "transfers" ("token_address","chain_id","block_number");--> statement-breakpoint
CREATE INDEX "wallets_chain_address_idx" ON "wallets" ("chain_id","address");--> statement-breakpoint
ALTER TABLE "balances" ADD CONSTRAINT "fk_wallet_chain" FOREIGN KEY ("wallet_address","chain_id") REFERENCES "wallets"("address","chain_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "balances" ADD CONSTRAINT "fk_token_address_chain_id" FOREIGN KEY ("token_address","chain_id") REFERENCES "tokens"("address","chain_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "fk_chain_id_block" FOREIGN KEY ("chain_id","block_hash") REFERENCES "blocks"("chain_id","hash") ON DELETE CASCADE;