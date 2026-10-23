-- Align the original vehicles table with the current vehicle API model.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'vehicles'
          AND column_name = 'brand'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'vehicles'
          AND column_name = 'make'
    ) THEN
        ALTER TABLE public.vehicles RENAME COLUMN brand TO make;
    END IF;
END
$$;

ALTER TABLE public.vehicles
    ADD COLUMN IF NOT EXISTS make VARCHAR(50),
    ADD COLUMN IF NOT EXISTS year INTEGER,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'vehicles'
          AND column_name = 'brand'
    ) THEN
        EXECUTE 'UPDATE public.vehicles SET make = brand WHERE make IS NULL';
    END IF;
END
$$;

-- Existing rows predate vehicle-year tracking; use the legacy migration value
-- until owners can edit their vehicle details.
UPDATE public.vehicles SET make = 'Unknown' WHERE make IS NULL OR make = '';
UPDATE public.vehicles SET year = 2024 WHERE year IS NULL;
UPDATE public.vehicles SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL;
UPDATE public.vehicles SET updated_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE updated_at IS NULL;

ALTER TABLE public.vehicles
    ALTER COLUMN make SET NOT NULL,
    ALTER COLUMN year SET NOT NULL,
    ALTER COLUMN year SET DEFAULT 2024,
    ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN created_at SET NOT NULL,
    ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN updated_at SET NOT NULL;

-- max_power_kw is no longer part of the API model. Keep existing values, but
-- allow new API-created records that do not provide this legacy field.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'vehicles'
          AND column_name = 'max_power_kw'
    ) THEN
        ALTER TABLE public.vehicles ALTER COLUMN max_power_kw DROP NOT NULL;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS ix_vehicles_user_id ON public.vehicles (user_id);
