-- ─── Pico one-paste database bootstrap ──────────────────────
-- Paste this whole file into the Neon SQL Editor (or any psql)
-- and run it. Idempotent: safe on a brand-new database AND on a
-- database reused from an older Pico deployment — existing tables
-- are kept, missing tables/columns are added.

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "handle" text NOT NULL,
  "wallet_address" text,
  "casper_public_key" text,
  "role" text DEFAULT 'creator' NOT NULL,
  "created_at" timestamp DEFAULT now(),
  CONSTRAINT "users_email_unique" UNIQUE("email"),
  CONSTRAINT "users_handle_unique" UNIQUE("handle")
);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'creator' NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "casper_public_key" text;

CREATE TABLE IF NOT EXISTS "pico_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "creator_id" text NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "price" numeric(10, 2) NOT NULL,
  "content_url" text,
  "type" text DEFAULT 'PDF',
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "link_id" uuid NOT NULL,
  "tx_hash" text NOT NULL,
  "payer_address" text NOT NULL,
  "amount" numeric(10, 2) NOT NULL,
  "chain" text DEFAULT 'base' NOT NULL,
  "created_at" timestamp DEFAULT now()
);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "chain" text DEFAULT 'base' NOT NULL;

CREATE TABLE IF NOT EXISTS "widget_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "link_id" uuid NOT NULL,
  "referrer" text,
  "user_agent" text,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "gift_cards" (
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

CREATE TABLE IF NOT EXISTS "gift_card_redemptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "gift_card_id" uuid NOT NULL,
  "link_id" uuid NOT NULL,
  "redeemer_id" text NOT NULL,
  "value_used" numeric(10, 2) NOT NULL,
  "settled" boolean DEFAULT false NOT NULL,
  "settlement_tx" text,
  "created_at" timestamp DEFAULT now()
);

-- Verify: should list 6 tables
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
