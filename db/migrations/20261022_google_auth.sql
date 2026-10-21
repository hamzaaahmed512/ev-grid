-- Run once in the Supabase SQL editor before deploying Google authentication.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_key ON public.users (google_sub);
-- Hi
