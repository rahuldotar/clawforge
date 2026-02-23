ALTER TABLE "approved_skills" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "approved_skills" ADD COLUMN "revoked_at" timestamp with time zone;
ALTER TABLE "approved_skills" ADD COLUMN "revoked_by" uuid;
