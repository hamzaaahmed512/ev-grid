-- =============================================================================
-- Script : 012_station_owner_module_rollback.sql
-- Purpose: Removes ONLY what 012_station_owner_module.sql added.
--
-- WARNING: Does NOT remove any existing data, base tables (stations, connectors,
--          users), or columns that pre-existed script 012.
--
-- Run this script to undo 012 before the next migration is applied.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drop status_logs table (new in 012)
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS status_logs;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Remove columns added to 'stations'
-- ─────────────────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS idx_stations_owner_id;

ALTER TABLE stations
    DROP COLUMN IF EXISTS owner_id,
    DROP COLUMN IF EXISTS type,
    DROP COLUMN IF EXISTS open_time,
    DROP COLUMN IF EXISTS close_time,
    DROP COLUMN IF EXISTS rating,
    DROP COLUMN IF EXISTS is_active,
    DROP COLUMN IF EXISTS updated_at;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Remove columns added to 'connectors'
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE connectors
    DROP COLUMN IF EXISTS label,
    DROP COLUMN IF EXISTS price_per_kwh,
    DROP COLUMN IF EXISTS is_active;

COMMIT;
