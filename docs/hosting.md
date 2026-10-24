# Hosted API connection

In Vercel, set `NEXT_PUBLIC_API_URL=https://ev-grid-api.onrender.com` for the frontend and redeploy it after changing this value. The frontend also sets `Cross-Origin-Opener-Policy: same-origin-allow-popups` so Google Identity Services can communicate with its sign-in popup.

In Render, set `ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000` for the API and redeploy it. The deployed frontend origin `https://ev-grid-eta.vercel.app` and both local origins are always allowed; add any other exact frontend origins as comma-separated values without paths. A JSON array of origins is also accepted. `CORS_ORIGINS` is accepted for compatibility when `ALLOWED_ORIGINS` is unset. Configure the Render start command as `cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT`; `app.main:app` is the entry point with the outer CORS wrapper.

If `GET /stations/` returns an internal server error, run `db/migrations/011_station_api_schema.sql` in the Supabase SQL editor. It safely creates the station/connector tables if needed and adds the station API columns without deleting listings. Do not rerun `006_add_real_data_fields.sql` on a live database: that legacy migration deletes station and connector rows.

Opening the API in a browser only confirms it is reachable. Its CORS settings must allow the frontend's exact origin before the frontend can read responses.

Before deploying vehicle creation, run `db/migrations/009_vehicle_api_schema.sql` once in the Supabase SQL editor. The original `002Vehicles.sql` schema uses legacy `brand` and required `max_power_kw` columns, while the current API writes `make` and `year` and does not send `max_power_kw`. The migration preserves legacy power values and assigns year `2024` to pre-existing rows whose model year was not recorded; owners can edit those records afterward.
