-- ============================================
-- SCHEMA UPDATE: Naye columns add karo
-- File: db/migrations/002_add_real_data_fields.sql
-- ============================================

-- Stations mein city aur price add karo
ALTER TABLE stations ADD COLUMN IF NOT EXISTS city VARCHAR(50);
ALTER TABLE stations ADD COLUMN IF NOT EXISTS price_per_kwh DECIMAL(6,2);

-- Connectors mein AC/DC type add karo
ALTER TABLE connectors ADD COLUMN IF NOT EXISTS charging_type VARCHAR(5);

-- Purana dummy data hatao (woh 10 fake stations)
DELETE FROM connectors;
DELETE FROM stations;

-- IDs reset karo taake 1 se shuru ho
ALTER SEQUENCE stations_id_seq RESTART WITH 1;
ALTER SEQUENCE connectors_id_seq RESTART WITH 1;