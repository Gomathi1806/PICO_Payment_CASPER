-- `casper_use_router` is already present in src/db/schema.ts but was never
-- captured in a migration, so drizzle-kit folded it into this one. It is
-- very likely already applied (pushed directly, or added by hand), hence
-- IF NOT EXISTS — this statement is here to close the drift between the
-- journal and the database, not to introduce the column.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "casper_use_router" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- One settlement unlocks one link. Backstop behind the per-rail binding
-- (the router's link_id arg, the native transfer's id memo).
--
-- NOTE: this CREATE fails if `payments` already holds duplicate tx_hash
-- rows. Check before deploying:
--
--   SELECT tx_hash, count(*) FROM payments
--   GROUP BY tx_hash HAVING count(*) > 1;
--
-- Any rows returned must be reconciled first — a duplicate means one
-- settlement was recorded against more than one link.
CREATE UNIQUE INDEX IF NOT EXISTS "payments_tx_hash_unique" ON "payments" USING btree ("tx_hash");
