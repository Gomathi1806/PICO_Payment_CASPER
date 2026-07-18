CREATE TABLE "price_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" uuid NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"sales" integer DEFAULT 0 NOT NULL,
	"old_price" numeric(10, 2) NOT NULL,
	"new_price" numeric(10, 2) NOT NULL,
	"reason" text NOT NULL,
	"applied" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "pico_links" ADD COLUMN "autonomous_pricing" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pico_links" ADD COLUMN "min_price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "pico_links" ADD COLUMN "max_price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "pico_links" ADD COLUMN "last_price_review_at" timestamp;