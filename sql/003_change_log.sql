-- 003_change_log.sql
-- What it does: adds the change log, one row for each record added or removed by a save in assignments, allocations, confirmations, progress, enrolments and the Beneficiary register (DECISIONS 235).
-- Who runs it: `npm run db:init`. Safe to run again. Additive: nothing reads it yet except developers.
CREATE TABLE IF NOT EXISTS change_log (
  id      bigserial PRIMARY KEY,
  org     text NOT NULL,
  at      timestamptz NOT NULL,
  by      text NOT NULL,           -- a display name only, never contact details
  action  text NOT NULL,           -- the request that made it, for example asg-assign
  section text NOT NULL,
  key     text NOT NULL,
  change  text NOT NULL,           -- added or removed (an edit is a removed and an added)
  record  jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS change_log_org_at ON change_log (org, at DESC);
CREATE INDEX IF NOT EXISTS change_log_org_key ON change_log (org, key);
