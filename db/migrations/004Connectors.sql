-- ============================================
-- VoltRelay: Connectors Table
-- Migration 004
-- ============================================

CREATE TABLE IF NOT EXISTS connectors (
    id             SERIAL PRIMARY KEY,
    station_id     INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    connector_type VARCHAR(50) NOT NULL,  -- e.g. "CCS2", "GB/T", "CHAdeMO", "Type2"
    max_power_kw   DECIMAL(6,2) NOT NULL DEFAULT 50.00,
    price_per_kwh  DECIMAL(6,2) NOT NULL DEFAULT 45.00,
    status         VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE', -- AVAILABLE, OCCUPIED, OFFLINE
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookup by station and connector_type
CREATE INDEX IF NOT EXISTS idx_connectors_station ON connectors(station_id);
CREATE INDEX IF NOT EXISTS idx_connectors_type ON connectors(connector_type);