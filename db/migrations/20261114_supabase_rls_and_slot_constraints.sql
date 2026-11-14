-- ==============================================================================
-- Supabase Row-Level Security (RLS) & Booking Exclusion Constraint Migration
-- Purpose: Run in Supabase SQL Editor to enforce RLS and eliminate 401/500 errors
-- ==============================================================================

-- 1. STATIONS TABLE: Public read access
ALTER TABLE stations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to stations" ON stations;
CREATE POLICY "Allow public read access to stations"
  ON stations FOR SELECT
  USING (true);

-- 2. CONNECTORS TABLE: Public read access
ALTER TABLE connectors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to connectors" ON connectors;
CREATE POLICY "Allow public read access to connectors"
  ON connectors FOR SELECT
  USING (true);

-- 3. VEHICLES TABLE: Scoped to vehicle owner
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own vehicles" ON vehicles;
CREATE POLICY "Users can view own vehicles"
  ON vehicles FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Users can insert own vehicles" ON vehicles;
CREATE POLICY "Users can insert own vehicles"
  ON vehicles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Users can update own vehicles" ON vehicles;
CREATE POLICY "Users can update own vehicles"
  ON vehicles FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Users can delete own vehicles" ON vehicles;
CREATE POLICY "Users can delete own vehicles"
  ON vehicles FOR DELETE
  TO authenticated
  USING (auth.uid()::text = user_id::text);

-- 4. BOOKINGS TABLE: Scoped to booking owner & conflict prevention
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
a
DROP POLICY IF EXISTS "Users can view own bookings" ON bookings;
CREATE POLICY "Users can view own bookings"
  ON bookings FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Users can insert own bookings" ON bookings;
CREATE POLICY "Users can insert own bookings"
  ON bookings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Users can update own bookings" ON bookings;
CREATE POLICY "Users can update own bookings"
  ON bookings FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = user_id::text);

-- 5. PERFORMANCE INDEXES FOR SLOT COLLISION LOOKUPS
CREATE INDEX IF NOT EXISTS idx_bookings_overlap_check 
  ON bookings (connector_id, status, start_time, end_time);

CREATE INDEX IF NOT EXISTS idx_bookings_user_id 
  ON bookings (user_id);
