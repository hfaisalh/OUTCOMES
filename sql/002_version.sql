-- 002_version.sql
-- What it does: gives every saved setup a version number, so two people saving at the same moment cannot silently overwrite each other (DECISIONS 235).
-- Who runs it: `npm run db:init`, BEFORE the code that reads it is deployed. Safe to run again. Existing rows start at 0.

ALTER TABLE org_config ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 0;
