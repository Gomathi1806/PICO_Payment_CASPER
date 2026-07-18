import { pgTable, text, timestamp, decimal, uuid, integer, boolean } from 'drizzle-orm/pg-core';

// ─── Users ──────────────────────────────────────────────────
// `role` decides which dashboard the user lands on after login and
// which menus they see. The four roles map to distinct products:
//
//   creator   → /dashboard      (individual influencers, writers)
//   publisher → /publisher      (newsrooms, magazines, B2B media)
//   agent     → /agents         (developer platform — x402 API users)
//   admin     → /admin          (internal Pico staff; also gated by
//                                ADMIN_EMAILS env allowlist for
//                                defence-in-depth on top of the role)
//
// Existing rows default to 'creator' so the migration is safe.
export const USER_ROLES = ['creator', 'publisher', 'agent', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  handle: text('handle').notNull().unique(),
  walletAddress: text('wallet_address'),
  // Casper account public key (hex, 01…/02… prefixed) — the payout
  // target for the CSPR rail, sibling of the EVM walletAddress.
  casperPublicKey: text('casper_public_key'),
  role: text('role').notNull().default('creator').$type<UserRole>(),
  createdAt: timestamp('created_at').defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// ─── Pico Links (Content for Sale) ──────────────────────────
export const picoLinks = pgTable('pico_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  creatorId: text('creator_id').notNull(), // User UUID stored as text for backward compat
  title: text('title').notNull(),
  description: text('description').notNull(),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  contentUrl: text('content_url'), // The gated content
  type: text('type').default('PDF'),
  // Autonomous pricing (Phase 2). Creator opts in and sets the range;
  // the pricing agent proposes/applies nudges within [minPrice, maxPrice]
  // based on the views-vs-payments funnel — never below minPrice, never
  // above maxPrice, never without an opt-in.
  autonomousPricing: boolean('autonomous_pricing').notNull().default(false),
  minPrice: decimal('min_price', { precision: 10, scale: 2 }),
  maxPrice: decimal('max_price', { precision: 10, scale: 2 }),
  lastPriceReviewAt: timestamp('last_price_review_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export type PicoLink = typeof picoLinks.$inferSelect;
export type NewPicoLink = typeof picoLinks.$inferInsert;

// ─── Payments (Transaction Records) ─────────────────────────
export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  linkId: uuid('link_id').notNull(),       // References picoLinks.id
  txHash: text('tx_hash').notNull(),
  payerAddress: text('payer_address').notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  // Which rail settled this payment: 'base' | 'base-sepolia' (EVM/USDC)
  // or 'casper' | 'casper-test' (native CSPR). Existing rows predate
  // the Casper rail, so 'base' is the safe backfill default.
  chain: text('chain').notNull().default('base'),
  createdAt: timestamp('created_at').defaultNow(),
});

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

// ─── Widget Views ───────────────────────────────────────────
// An impression of the paywall — someone loaded an article that
// embeds a Pico widget and got a 402 back. Combined with `payments`
// this gives publishers a real conversion funnel and lets the admin
// dashboard surface dormant (no views in 7+ days) or hot widgets.
// Referrer is logged so publishers can see which articles drive
// paywall impressions; user-agent is bucketed (browser vs agent vs
// bot) for the developer-platform analytics.
export const widgetViews = pgTable('widget_views', {
  id: uuid('id').primaryKey().defaultRandom(),
  linkId: uuid('link_id').notNull(),
  referrer: text('referrer'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow(),
});

export type WidgetView = typeof widgetViews.$inferSelect;
export type NewWidgetView = typeof widgetViews.$inferInsert;

// ─── Gift Cards (Vouchers / Credits) ────────────────────────
// A gift card is a VOUCHER that unlocks content — never cash, never
// withdrawable. It is the access layer that sits beside `payments`:
// content unlocks if a matching paid `payment` OR a redeemed gift card
// exists. Pico never holds funds — whoever funds a card (Pico for
// promos, a creator for giveaways, a fan for gifts, a brand for
// sponsorships) pays the creator directly.
//
//   kind 'promo'   → Pico-funded welcome voucher (free first unlock)
//   kind 'gift'    → fan pre-pays the creator, shares a code
//   kind 'sponsor' → brand funds free reads
//
// `prefunded` = true means the creator was already paid at issue time
// (gift/sponsor); false means Pico owes the creator and settles later
// from its own treasury (promo). Either way no buyer money is held.
export const GIFT_CARD_KINDS = ['promo', 'gift', 'sponsor'] as const;
export type GiftCardKind = (typeof GIFT_CARD_KINDS)[number];

export const giftCards = pgTable('gift_cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').unique(),                       // null for auto-applied promos
  kind: text('kind').notNull().$type<GiftCardKind>(),
  funderType: text('funder_type').notNull(),         // 'pico' | 'fan' | 'sponsor'
  funderId: text('funder_id'),                       // who funded it (nullable)
  scopeType: text('scope_type').notNull().default('any'), // 'link' | 'creator' | 'any'
  scopeId: text('scope_id'),                         // linkId or creatorId
  totalValue: decimal('total_value', { precision: 10, scale: 2 }).notNull(),
  remaining: decimal('remaining', { precision: 10, scale: 2 }).notNull(),
  prefunded: boolean('prefunded').notNull().default(false),
  fundingTx: text('funding_tx'),                     // on-chain proof creator was prepaid
  maxPerUser: integer('max_per_user').notNull().default(1),
  status: text('status').notNull().default('active'),// active | depleted | expired | revoked
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export type GiftCard = typeof giftCards.$inferSelect;
export type NewGiftCard = typeof giftCards.$inferInsert;

// The access record — sibling of `payments`. One row = one unlock
// granted via a voucher. `settled` tracks whether the creator has been
// paid yet (promos are settled from the Pico treasury, batched).
export const giftCardRedemptions = pgTable('gift_card_redemptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  giftCardId: uuid('gift_card_id').notNull(),
  linkId: uuid('link_id').notNull(),
  redeemerId: text('redeemer_id').notNull(),         // wallet address or user id
  valueUsed: decimal('value_used', { precision: 10, scale: 2 }).notNull(),
  settled: boolean('settled').notNull().default(false),
  settlementTx: text('settlement_tx'),               // Pico→creator tx (promo)
  createdAt: timestamp('created_at').defaultNow(),
});

export type GiftCardRedemption = typeof giftCardRedemptions.$inferSelect;
export type NewGiftCardRedemption = typeof giftCardRedemptions.$inferInsert;

// ─── Price Reviews (Autonomous Seller Agent Audit Log) ──────
// Every proposal from the pricing agent — accepted or dry-run — is
// written here with the funnel snapshot it saw and the reason Claude
// gave. Gives creators a receipt they can inspect, and gives Pico an
// immutable audit trail for the agentic seller flow.
export const priceReviews = pgTable('price_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  linkId: uuid('link_id').notNull(),
  views: integer('views').notNull().default(0),
  sales: integer('sales').notNull().default(0),
  oldPrice: decimal('old_price', { precision: 10, scale: 2 }).notNull(),
  newPrice: decimal('new_price', { precision: 10, scale: 2 }).notNull(),
  reason: text('reason').notNull(),
  applied: boolean('applied').notNull().default(false), // false = dry run
  createdAt: timestamp('created_at').defaultNow(),
});

export type PriceReview = typeof priceReviews.$inferSelect;
export type NewPriceReview = typeof priceReviews.$inferInsert;
