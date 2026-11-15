# Hosted API connection

The frontend now talks to its own Next.js API routes (`/api/*`), which
authenticate with Supabase session cookies. `NEXT_PUBLIC_API_URL` on Vercel is
**only** used by the live-stations WebSocket hook (`lib/useLiveStations.ts`);
keep it set to `https://ev-grid-api.onrender.com` until the TCP gateway moves
behind Next.js. The frontend sets `Cross-Origin-Opener-Policy:
same-origin-allow-popups` globally in `next.config.mjs`.

## Render (legacy Python API)

- The `/auth/signup`, `/auth/login` and `/auth/google` endpoints return
  **410 Gone** — authentication is now Supabase-only.
- Set `SUPABASE_JWT_SECRET` (Supabase → Project Settings → API → JWT Secret)
  on Render so protected endpoints verify Supabase access tokens instead of
  trusting unverified JWT claims.
- `ALLOWED_ORIGINS` still needs `https://ev-grid-eta.vercel.app` (it is
  hardcoded as a required origin in `app/config.py`).
- Configure the Render start command as
  `cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT`.

## Supabase (database)

If `GET /api/stations` returns empty/500, run in the SQL editor:

1. `db/migrations/011_station_api_schema.sql` (station/connector schema), then
2. `db/migrations/20261115_supabase_auth_link.sql` (identity link + RLS repair
   — required for vehicles, bookings and sessions to work).

Do **not** run `006_add_real_data_fields.sql` on the live database: that legacy
migration deletes station and connector rows.

Opening the API in a browser only confirms it is reachable; CORS must allow
the frontend's exact origin before the frontend can read responses.

Before deploying vehicle creation, ensure `db/migrations/009_vehicle_api_schema.sql`
has run once (it aligns the vehicles table with the API model without
deleting listings).
