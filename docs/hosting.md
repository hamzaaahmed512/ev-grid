# Hosted API connection

In Vercel, set `NEXT_PUBLIC_API_URL=https://ev-grid-api.onrender.com` for the frontend and redeploy it after changing this value. The frontend also sets `Cross-Origin-Opener-Policy: same-origin-allow-popups` so Google Identity Services can communicate with its sign-in popup.

In Render, set `ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000` for the API and redeploy it. The deployed frontend origin `https://ev-grid-eta.vercel.app` is always allowed; add any other exact frontend origins as comma-separated values without paths. `CORS_ORIGINS` is also accepted for compatibility; `ALLOWED_ORIGINS` takes precedence when both are set.

Opening the API in a browser only confirms it is reachable. Its CORS settings must allow the frontend's exact origin before the frontend can read responses.
