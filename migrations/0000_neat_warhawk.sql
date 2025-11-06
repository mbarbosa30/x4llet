CREATE TABLE "authorizations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain_id" integer NOT NULL,
	"nonce" text NOT NULL,
	"from" text NOT NULL,
	"to" text NOT NULL,
	"value" text NOT NULL,
	"valid_after" text NOT NULL,
	"valid_before" text NOT NULL,
	"signature" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"used_at" timestamp,
	"tx_hash" text,
	CONSTRAINT "authorizations_nonce_chain_id_unique" UNIQUE("nonce","chain_id")
);
--> statement-breakpoint
CREATE TABLE "cached_balances" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address" text NOT NULL,
	"chain_id" integer NOT NULL,
	"balance" text NOT NULL,
	"decimals" integer DEFAULT 6 NOT NULL,
	"nonce" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cached_balances_address_chain_id_unique" UNIQUE("address","chain_id")
);
--> statement-breakpoint
CREATE TABLE "cached_transactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tx_hash" text NOT NULL,
	"chain_id" integer NOT NULL,
	"type" text NOT NULL,
	"from" text NOT NULL,
	"to" text NOT NULL,
	"amount" text NOT NULL,
	"timestamp" timestamp NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cached_transactions_tx_hash_unique" UNIQUE("tx_hash")
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"currency" text NOT NULL,
	"rate" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_rates_currency_unique" UNIQUE("currency")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_address_unique" UNIQUE("address")
);
