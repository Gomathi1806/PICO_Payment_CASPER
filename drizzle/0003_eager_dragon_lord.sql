CREATE TABLE "gift_card_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gift_card_id" uuid NOT NULL,
	"link_id" uuid NOT NULL,
	"redeemer_id" text NOT NULL,
	"value_used" numeric(10, 2) NOT NULL,
	"settled" boolean DEFAULT false NOT NULL,
	"settlement_tx" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "gift_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text,
	"kind" text NOT NULL,
	"funder_type" text NOT NULL,
	"funder_id" text,
	"scope_type" text DEFAULT 'any' NOT NULL,
	"scope_id" text,
	"total_value" numeric(10, 2) NOT NULL,
	"remaining" numeric(10, 2) NOT NULL,
	"prefunded" boolean DEFAULT false NOT NULL,
	"funding_tx" text,
	"max_per_user" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "gift_cards_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "chain" text DEFAULT 'base' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "casper_public_key" text;