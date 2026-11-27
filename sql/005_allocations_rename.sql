-- 005_allocations_rename.sql
-- What it does: follows the rename of "placements" to "allocations" in the code (DECISIONS 252, 253). The record table is now `allocations` (made by 004), the old `placements` table is dropped, and the older outcome allocations kept in an organisation's setup move from the key `allocations` to `outcomeAllocations`.
-- Who runs it: `npm run db:init`, BEFORE the code that reads the new names is deployed. Safe to run again. The data was invented test data, so the old table is dropped, not copied. To clear the other invented records too, run `npm run db:reset-records`.
DROP TABLE IF EXISTS placements;
UPDATE org_config SET config = (config - 'allocations') || jsonb_build_object('outcomeAllocations', config->'allocations') WHERE jsonb_typeof(config->'allocations') = 'array';
UPDATE org_config SET config = config - 'placements' WHERE config ? 'placements';
