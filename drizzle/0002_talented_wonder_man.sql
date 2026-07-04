CREATE TABLE "widget_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" uuid NOT NULL,
	"referrer" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now()
);
