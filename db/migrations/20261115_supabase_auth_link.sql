-- ==============================================================================
-- Supabase Auth ↔ Application Identity Link + RLS Repair
-- Run in the Supabase SQL Editor. Idempotent — safe to re-run.
-- ==============================================================================
-- What this fixes:
--   1. The legacy `users` table (integer PK) is linked to Supabase Auth UUIDs
--      via users.supabase_uid, with a trigger that provisions rows for every
--      new auth user and a backfill for existing ones.
--   2. The broken 20261114 RLS script (syntax error on line 51 meant bookings
--      got RLS enabled with ZERO policies, and vehicle policies compared a
--      UUID to an integer user_id, which can never match).
--   3. Public SELECT on stations/connectors; owner-scoped access on
--      vehicles / bookings / charging_sessions.
-- ==============================================================================

-- -----------------------------------------------------------------------------
-- 1. Identity link column
-- -----------------------------------------------------------------------------
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS supabase_uid UUID;

CREATE UNIQUE INDEX IF NOT EXISTS users_supabase_uid_key
    ON public.users (supabase_uid)
    WHERE supabase_uid IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. Provision a public.users row for every new Supabase auth user
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email     text;
    v_name      text;
    v_legacy_id integer;
BEGIN
    v_email := lower(new.email);
    v_name := left(coalesce(
        new.raw_user_meta_data->>'full_name',
        new.raw_user_meta_data->>'name',
        split_part(coalesce(v_email, ''), '@', 1),
        'EV Driver'
    ), 100);
    IF v_name IS NULL OR length(trim(v_name)) = 0 THEN
        v_name := 'EV Driver';
    END IF;

    -- Already linked?
    SELECT id INTO v_legacy_id FROM public.users WHERE supabase_uid = new.id LIMIT 1;

    -- Legacy account with the same email? Link it instead of duplicating.
    IF v_legacy_id IS NULL AND v_email IS NOT NULL THEN
        SELECT id INTO v_legacy_id FROM public.users WHERE lower(email) = v_email LIMIT 1;
    END IF;

    IF v_legacy_id IS NOT NULL THEN
        UPDATE public.users SET supabase_uid = new.id WHERE id = v_legacy_id;
    ELSIF v_email IS NOT NULL THEN
        INSERT INTO public.users (name, email, password_hash, supabase_uid, role)
        VALUES (v_name, v_email, md5(random()::text), new.id, 'driver')
        ON CONFLICT (email) DO UPDATE SET supabase_uid = excluded.supabase_uid;
    END IF;

    RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 3. Backfill: link existing accounts and create rows for auth users
--    created before this trigger existed
-- -----------------------------------------------------------------------------
UPDATE public.users u
SET supabase_uid = au.id
FROM auth.users au
WHERE lower(u.email) = lower(au.email)
  AND u.supabase_uid IS NULL;

INSERT INTO public.users (name, email, password_hash, supabase_uid, role)
SELECT
    left(coalesce(au.raw_user_meta_data->>'full_name',
                  split_part(lower(au.email), '@', 1), 'EV Driver'), 100),
    lower(au.email),
    md5(random()::text),
    au.id,
    'driver'
FROM auth.users au
WHERE au.email IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.supabase_uid = au.id
         OR lower(u.email) = lower(au.email)
  );

-- -----------------------------------------------------------------------------
-- 4. Helper: legacy integer user id for the current Supabase identity
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id FROM public.users WHERE supabase_uid = auth.uid() LIMIT 1;
$$;

-- -----------------------------------------------------------------------------
-- 5. Row Level Security
-- -----------------------------------------------------------------------------

-- 5a. Stations: public read (map/discovery works for logged-out visitors)
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read access to stations" ON public.stations;
DROP POLICY IF EXISTS "Public read access to stations" ON public.stations;
CREATE POLICY "Public read access to stations"
    ON public.stations FOR SELECT
    USING (true);

-- 5b. Connectors: public read
ALTER TABLE public.connectors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read access to connectors" ON public.connectors;
DROP POLICY IF EXISTS "Public read access to connectors" ON public.connectors;
CREATE POLICY "Public read access to connectors"
    ON public.connectors FOR SELECT
    USING (true);

-- 5c. Vehicles: owner-scoped (drops the broken UUID-vs-integer policies)
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own vehicles" ON public.vehicles;
CREATE POLICY "Users can view own vehicles"
    ON public.vehicles FOR SELECT
    TO authenticated
    USING (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS "Users can insert own vehicles" ON public.vehicles;
CREATE POLICY "Users can insert own vehicles"
    ON public.vehicles FOR INSERT
    TO authenticated
    WITH CHECK (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS "Users can update own vehicles" ON public.vehicles;
CREATE POLICY "Users can update own vehicles"
    ON public.vehicles FOR UPDATE
    TO authenticated
    USING (user_id = public.current_app_user_id())
    WITH CHECK (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS "Users can delete own vehicles" ON public.vehicles;
CREATE POLICY "Users can delete own vehicles"
    ON public.vehicles FOR DELETE
    TO authenticated
    USING (user_id = public.current_app_user_id());

-- 5d. Bookings: owner-scoped (replaces "RLS enabled with zero policies")
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own bookings" ON public.bookings;
CREATE POLICY "Users can view own bookings"
    ON public.bookings FOR SELECT
    TO authenticated
    USING (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS "Users can insert own bookings" ON public.bookings;
CREATE POLICY "Users can insert own bookings"
    ON public.bookings FOR INSERT
    TO authenticated
    WITH CHECK (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS "Users can update own bookings" ON public.bookings;
CREATE POLICY "Users can update own bookings"
    ON public.bookings FOR UPDATE
    TO authenticated
    USING (user_id = public.current_app_user_id())
    WITH CHECK (user_id = public.current_app_user_id());

-- 5e. Charging sessions: owner-scoped telemetry
ALTER TABLE public.charging_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own charging sessions" ON public.charging_sessions;
CREATE POLICY "Users can view own charging sessions"
    ON public.charging_sessions FOR SELECT
    TO authenticated
    USING (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS "Users can update own charging sessions" ON public.charging_sessions;
CREATE POLICY "Users can update own charging sessions"
    ON public.charging_sessions FOR UPDATE
    TO authenticated
    USING (user_id = public.current_app_user_id())
    WITH CHECK (user_id = public.current_app_user_id());

-- -----------------------------------------------------------------------------
-- 6. Performance indexes for slot-collision checks and identity lookups
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bookings_overlap_check
    ON public.bookings (connector_id, status, start_time, end_time);

CREATE INDEX IF NOT EXISTS idx_bookings_user_id
    ON public.bookings (user_id);

CREATE INDEX IF NOT EXISTS idx_charging_sessions_user_id
    ON public.charging_sessions (user_id);

-- ==============================================================================
-- End of migration
-- ==============================================================================
