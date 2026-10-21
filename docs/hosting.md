# Hosted API connection

In Vercel, set `NEXT_PUBLIC_API_URL=https://ev-grid-api.onrender.com` for the frontend and redeploy it after changing this value.

In Render, set `ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,https://ev-grid-eta.vercel.app` for the API and redeploy it. `CORS_ORIGINS` is also accepted for compatibility; `ALLOWED_ORIGINS` takes precedence when both are set. Use comma-separated origins without paths.

Opening the API in a browser only confirms it is reachable. Its CORS settings must allow the frontend's exact origin before the frontend can read responses.
