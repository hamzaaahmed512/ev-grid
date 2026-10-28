-- =============================================================================
-- VoltRelay — Database Migration: Live Status & Charging Sessions
-- File: db/migrations/006_live_status.sql
-- Module 5: TCP Charger Simulator + Live Status Gateway (Part 1)
-- =============================================================================
-- Description:
-- 1. Extends connectors table with simulated charger identification and live telemetry.
-- 2. Creates the charging_sessions table to record real-time and historical charging.
-- 3. Accommodates the 'IN_PROGRESS' booking lifecycle state safely.
-- 4. Deterministically assigns simulated charger IDs (SIM-001 .. SIM-010) to 10 connectors.
--
-- Note on Idempotency & Safety:
-- - All table and column alterations use IF NOT EXISTS.
-- - Partial unique indexes and constraints are created idempotently.
-- - Simulated charger ID assignment only targets existing connectors deterministically
--   and is safe to rerun.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extend connectors table with live telemetry and simulated charger ID
-- -----------------------------------------------------------------------------
ALTER TABLE public.connectors
    ADD COLUMN IF NOT EXISTS charger_id VARCHAR(50),
    ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS current_power_kw DECIMAL(6, 2) NOT NULL DEFAULT 0.00;

-- Ensure charger_id is unique across all non-null simulated hardware identifiers
CREATE UNIQUE INDEX IF NOT EXISTS uq_connectors_charger_id
    ON public.connectors (charger_id)
    WHERE charger_id IS NOT NULL;

-- Index for quick liveness queries (e.g. heartbeat sweeps for offline chargers)
CREATE INDEX IF NOT EXISTS idx_connectors_last_seen
    ON public.connectors (last_seen);

-- Index for connector status filtering
CREATE INDEX IF NOT EXISTS idx_connectors_status
    ON public.connectors (status);


-- -----------------------------------------------------------------------------
-- 2. Create charging_sessions table
-- -----------------------------------------------------------------------------
-- Records active telemetry and completed records for both reservation and walk-in sessions.
CREATE TABLE IF NOT EXISTS public.charging_sessions (
    id SERIAL PRIMARY KEY,

    -- Foreign Key: target connector being charged at
    connector_id INTEGER NOT NULL REFERENCES public.connectors(id) ON DELETE CASCADE,

    -- Foreign Key: associated booking (nullable for walk-in / immediate sessions)
    booking_id INTEGER REFERENCES public.bookings(id) ON DELETE SET NULL,

    -- Foreign Key: user who initiated the session (nullable for walk-in or anonymous sessions)
    user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL,

    -- Lifecycle status of the charging session
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CONSTRAINT chk_charging_sessions_status CHECK (status IN ('ACTIVE', 'COMPLETED', 'FAULTED')),

    -- Session timestamps
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,

    -- Battery state of charge (percentage 0.00% to 100.00%)
    soc_start DECIMAL(5, 2)
        CONSTRAINT chk_charging_sessions_soc_start CHECK (soc_start IS NULL OR (soc_start >= 0.00 AND soc_start <= 100.00)),
    soc_end DECIMAL(5, 2)
        CONSTRAINT chk_charging_sessions_soc_end CHECK (soc_end IS NULL OR (soc_end >= 0.00 AND soc_end <= 100.00)),

    -- Energy delivered in kilowatt-hours (accumulated via METER telemetry)
    kwh_delivered DECIMAL(8, 4) NOT NULL DEFAULT 0.0000
        CONSTRAINT chk_charging_sessions_kwh CHECK (kwh_delivered >= 0.0000),

    -- Peak active power observed during this session in kW
    peak_power_kw DECIMAL(6, 2) NOT NULL DEFAULT 0.00
        CONSTRAINT chk_charging_sessions_peak_power CHECK (peak_power_kw >= 0.00),

    -- Financial settlement amount in PKR
    cost DECIMAL(10, 2) NOT NULL DEFAULT 0.00
        CONSTRAINT chk_charging_sessions_cost CHECK (cost >= 0.00),

    -- Final stop reason (e.g. 'EV_DISCONNECTED', 'FULL_BATTERY', 'REMOTE_STOP', 'LOCAL_STOP', 'FAULT')
    stop_reason VARCHAR(100),

    -- Audit timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Performance and lookup indexes
CREATE INDEX IF NOT EXISTS idx_charging_sessions_connector_id
    ON public.charging_sessions (connector_id);

CREATE INDEX IF NOT EXISTS idx_charging_sessions_booking_id
    ON public.charging_sessions (booking_id);

CREATE INDEX IF NOT EXISTS idx_charging_sessions_user_id
    ON public.charging_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_charging_sessions_status
    ON public.charging_sessions (status);

CREATE INDEX IF NOT EXISTS idx_charging_sessions_started_at
    ON public.charging_sessions (started_at DESC);

-- Concurrency protection: Enforce at most ONE ACTIVE session per connector at any time.
-- This prevents race conditions and duplicate session records at the database level.
CREATE UNIQUE INDEX IF NOT EXISTS uq_charging_sessions_active_connector
    ON public.charging_sessions (connector_id)
    WHERE status = 'ACTIVE';


-- -----------------------------------------------------------------------------
-- 3. Booking Lifecycle: Ensure 'IN_PROGRESS' is Supported
-- -----------------------------------------------------------------------------
-- In existing migrations (005Bookings.sql), bookings.status is VARCHAR(30) DEFAULT 'CONFIRMED'
-- without an explicit CHECK constraint.
-- If an environment has added a CHECK constraint on bookings.status, dynamically update it
-- to permit 'IN_PROGRESS' alongside existing statuses ('CONFIRMED', 'CANCELLED', 'COMPLETED').
DO $$
DECLARE
    v_constraint_name TEXT;
BEGIN
    SELECT conname INTO v_constraint_name
    FROM pg_constraint
    WHERE conrelid = 'public.bookings'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%';

    IF v_constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.bookings DROP CONSTRAINT ' || quote_ident(v_constraint_name);
        EXECUTE 'ALTER TABLE public.bookings ADD CONSTRAINT ' || quote_ident(v_constraint_name) ||
                ' CHECK (status IN (''CONFIRMED'', ''CANCELLED'', ''COMPLETED'', ''IN_PROGRESS''))';
    END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 4. Deterministic Simulated Charger ID Assignment
-- -----------------------------------------------------------------------------
-- Assigns simulated charger IDs 'SIM-001' through 'SIM-010' to the first 10 connectors
-- ordered deterministically by id ASC.
--
-- Re-run Safety:
-- Uses a CTE to select the lowest 10 connector IDs. If rerun, it re-applies the exact
-- same IDs to the same target connectors without causing unique constraint violations.
WITH target_connectors AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY id ASC) AS rn
    FROM public.connectors
    ORDER BY id ASC
    LIMIT 10
)
UPDATE public.connectors c
SET charger_id = 'SIM-' || LPAD(t.rn::TEXT, 3, '0')
FROM target_connectors t
WHERE c.id = t.id
  AND (c.charger_id IS NULL OR c.charger_id = 'SIM-' || LPAD(t.rn::TEXT, 3, '0'));

-- =============================================================================
-- End of Migration 006_live_status.sql
-- =============================================================================
