# Google sign-in via Supabase Auth

Google sign-in is handled entirely by **Supabase Auth** (`supabase.auth.signInWithOAuth`).
The frontend redirects to `/api/auth/callback`, which exchanges the PKCE code
and stores the session in HTTP-only cookies. The old Google Identity Services
popup flow and its custom token endpoint are removed.

## Supabase Dashboard checklist (required for production)

1. **Authentication → Sign In / Up → Email**
   - "Confirm email" is currently **ON** (`mailer_autoconfirm: false`).
     - Either turn it **OFF** so sign-up returns a session immediately, or
     - configure **SMTP** (Authentication → SMTP) because the built-in sender
       is heavily rate-limited and confirmation mail may never arrive.

2. **Authentication → URL Configuration**
   - Site URL: `https://ev-grid-eta.vercel.app`
   - Redirect URLs must include:
     - `https://ev-grid-eta.vercel.app/**`
     - `http://localhost:3000/**`

3. **Authentication → Providers → Google** must stay enabled (it is).

## Google Cloud Console checklist

1. OAuth client (Web application) for project `266489344451-…`:
   - **Authorized redirect URI**: `https://dfovofvjiirolxsxynqq.supabase.co/auth/v1/callback`
   - The old JS origins are no longer needed for sign-in (no popup).

## Local development

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in
  `frontend/.env.local` (already configured).

## Backend (Render)

- Set `SUPABASE_JWT_SECRET` (Project Settings → API → JWT Secret) so
  `Authorization: Bearer <supabase-token>` on legacy REST endpoints is
  verified with a real signature check instead of being trusted blindly.

## Database

- Run `db/migrations/20261115_supabase_auth_link.sql` once in the SQL editor.
  It links Supabase identities to the legacy integer `users` table, provisions
  new users automatically, and repairs the broken RLS policies that caused
  401/500 errors on bookings and vehicles.
