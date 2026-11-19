-- 001_init.sql
-- What it does: creates the tables OUTCOMES needs (see modules/00-platform/pg-store.ts).
-- Who runs it: once per database, by a developer or `npm run db:init`. Safe to run again.
-- Every table is keyed by the organisation, so one organisation never sees another's records.

CREATE TABLE IF NOT EXISTS org_config (
  org    text PRIMARY KEY,
  config jsonb NOT NULL            -- frameworks, categories, item map, CRM setting
);

CREATE TABLE IF NOT EXISTS work_orders (
  org  text NOT NULL,
  key  text NOT NULL,              -- transactionRef:lineId, one work order per CRM line
  data jsonb NOT NULL,
  PRIMARY KEY (org, key)
);

CREATE TABLE IF NOT EXISTS review (
  org   text PRIMARY KEY,
  items jsonb NOT NULL             -- changes held for a person to approve
);

CREATE TABLE IF NOT EXISTS runs (
  org  text PRIMARY KEY,
  info jsonb NOT NULL              -- what the last pick-up did
);

CREATE TABLE IF NOT EXISTS used_launch (
  jti        text PRIMARY KEY,     -- launch tokens already used (each works once)
  expires_at bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS audits (
  org  text NOT NULL,
  id   text NOT NULL,              -- one batch audit per import (DECISIONS 21, 43)
  at   text NOT NULL,              -- ISO time of the import, sorts newest first
  data jsonb NOT NULL,
  PRIMARY KEY (org, id)
);
