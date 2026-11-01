CREATE TABLE IF NOT EXISTS vehicles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    brand VARCHAR(50) NOT NULL,
    model VARCHAR(50) NOT NULL,
    connector_type VARCHAR(20) NOT NULL,
    max_power_kw DECIMAL(5,1) NOT NULL,
    battery_capacity_kwh DECIMAL(5,1) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- ==========================================
-- 1. UPGRADE EXISTING `vehicles` TABLE
-- ==========================================

-- Add new missing columns for Phase 1
ALTER TABLE vehicles 
  ADD COLUMN IF NOT EXISTS year INTEGER,
  ADD COLUMN IF NOT EXISTS nickname VARCHAR(50),
  ADD COLUMN IF NOT EXISTS range_km INTEGER,
  ADD COLUMN IF NOT EXISTS color VARCHAR(30),
  ADD COLUMN IF NOT EXISTS license_plate VARCHAR(20),
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Add performance indexes
CREATE INDEX IF NOT EXISTS idx_vehicles_user_id ON vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_is_primary ON vehicles(user_id, is_primary) WHERE is_primary = TRUE;

-- Function & Trigger: Automatic updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_vehicles_updated_at ON vehicles;
CREATE TRIGGER trigger_vehicles_updated_at
  BEFORE UPDATE ON vehicles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function & Trigger: Ensure EXACTLY ONE primary vehicle per user
CREATE OR REPLACE FUNCTION ensure_single_primary_vehicle()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_primary = TRUE THEN
    UPDATE vehicles
    SET is_primary = FALSE
    WHERE user_id = NEW.user_id
      AND id <> NEW.id
      AND is_primary = TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_single_primary_vehicle ON vehicles;
CREATE TRIGGER trigger_single_primary_vehicle
  AFTER INSERT OR UPDATE OF is_primary ON vehicles
  FOR EACH ROW
  WHEN (NEW.is_primary = TRUE)
  EXECUTE FUNCTION ensure_single_primary_vehicle();

-- Enable RLS for Security
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;


-- ==========================================
-- 2. USER PROFILES EXTENSION (FOR USERS TABLE)
-- ==========================================

-- Check/Add Profile fields to existing users table
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS city VARCHAR(50),
  ADD COLUMN IF NOT EXISTS profile_image_url TEXT,
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'driver',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

DROP TRIGGER IF EXISTS trigger_users_updated_at ON users;
CREATE TRIGGER trigger_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();