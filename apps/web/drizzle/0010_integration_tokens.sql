-- 260607-h2k: integration_tokens for rotating provider tokens (Strava, etc.).
-- Composite PK (user_id, provider) — one row per user per provider.
-- Single-user MVP: no RLS policy here per plan out_of_scope.
CREATE TABLE IF NOT EXISTS "integration_tokens" (
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_tokens_user_provider_pk" PRIMARY KEY("user_id","provider"),
	CONSTRAINT "integration_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action
);
