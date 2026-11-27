-- 004_record_tables.sql
-- What it does: gives each kind of record its own table, one row per record, instead of all of them living inside the one JSON document of org_config (DECISIONS 237, docs/DATABASE-REVIEW.md steps 3 and 4).
-- Who runs it: `npm run db:init`, BEFORE the code that reads it is deployed. Safe to run again. Additive: org_config keeps the counters and settings, and any records still in it are moved by the next save (or by scripts/db-move-records.mjs).
-- Every table has the same shape: the organisation, a row id (the record's own ID where it has one, otherwise a fingerprint of its content), its position in the list, and the record. beneficiaries holds children's records, so it can be read, exported or erased on its own.

CREATE TABLE IF NOT EXISTS beneficiaries (org text NOT NULL, rid text NOT NULL, pos integer NOT NULL, data jsonb NOT NULL, PRIMARY KEY (org, rid));
CREATE TABLE IF NOT EXISTS enrolments    (org text NOT NULL, rid text NOT NULL, pos integer NOT NULL, data jsonb NOT NULL, PRIMARY KEY (org, rid));
CREATE TABLE IF NOT EXISTS assignments   (org text NOT NULL, rid text NOT NULL, pos integer NOT NULL, data jsonb NOT NULL, PRIMARY KEY (org, rid));
CREATE TABLE IF NOT EXISTS allocations    (org text NOT NULL, rid text NOT NULL, pos integer NOT NULL, data jsonb NOT NULL, PRIMARY KEY (org, rid));
CREATE TABLE IF NOT EXISTS stock         (org text NOT NULL, rid text NOT NULL, pos integer NOT NULL, data jsonb NOT NULL, PRIMARY KEY (org, rid));
CREATE TABLE IF NOT EXISTS confirmations (org text NOT NULL, rid text NOT NULL, pos integer NOT NULL, data jsonb NOT NULL, PRIMARY KEY (org, rid));
CREATE TABLE IF NOT EXISTS progress      (org text NOT NULL, rid text NOT NULL, pos integer NOT NULL, data jsonb NOT NULL, PRIMARY KEY (org, rid));
