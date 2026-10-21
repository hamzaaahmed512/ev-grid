# Enable Google sign-in

The integration uses Google Identity Services and verifies Google's ID tokens on the API before issuing an EV Grid session. No client secret is required.

1. Open https://console.cloud.google.com/ and create or select your project.
2. In Google Auth Platform, configure Branding, Audience, and Data Access. While the app is in testing, add your Google account as a test user. Only basic profile and email are used.
3. Under Clients, create an OAuth client with application type **Web application**. Add these **Authorized JavaScript origins** (no paths):
   - `http://localhost:3000`
   - `http://127.0.0.1:3000`
   - `https://ev-grid-eta.vercel.app`
4. Copy the client ID ending in `.apps.googleusercontent.com`.
5. Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in `frontend/.env.local` locally and in Vercel's frontend environment variables.
6. Set `GOOGLE_CLIENT_ID` to the same value in `backend/.env` locally and in Render's API environment variables.
7. Run `db/migrations/20261022_google_auth.sql` in the Supabase SQL editor before starting the updated backend. This adds an optional, unique Google identity to existing user records without changing their passwords.
8. Install the updated backend requirements, restart both apps, and redeploy both hosted services. Vercel public environment variables are applied at build time.

Keep `NEXT_PUBLIC_API_URL=https://ev-grid-api.onrender.com` on Vercel and include `https://ev-grid-eta.vercel.app` in Render's `ALLOWED_ORIGINS`.

Google sign-in works for both account creation and login. Returning users are identified by Google's stable `sub` identifier. Existing Gmail or managed Google Workspace accounts can be linked when Google is authoritative for the verified email. Existing third-party-email accounts must continue using their original sign-in method; matching an email alone cannot link those accounts.

New Google accounts receive an unguessable random password hash and use Google to log in. Workspace selection controls the interface only and grants no backend privileges.

Verification reference: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
