# EV Grid

A responsive EV-charging marketplace frontend for a P2P (community) and B2P (business) charging-sharing platform.

## Start locally

Requires Node.js 20+. Run these commands from the repository root or the frontend directory.

```bash
npm install
npm run dev
```

Open http://localhost:3000 in your browser.

For a production build:

```bash
npm run typecheck
npm run build
npm run start
```

## Included

- Public landing page, How It Works, About, and Contact
- Sign-in, sign-up and password recovery screens
- Role switcher with Driver, Private Host, Business and Admin dashboards
- Charging station search, filters, sorting and OpenStreetMap via Leaflet
- Station detail views and favorite toggling
- Booking flow, confirmation and cancellation
- Host charger listing wizard, station controls, weekly schedule and earnings
- Business network dashboard, station management and analytics
- Admin overview, users, stations and reports
- Responsive navigation and sample chart data

## Stack

Next.js (App Router), React, TypeScript, CSS, Leaflet + OpenStreetMap, Recharts and Lucide icons.

## Files

- `app/page.tsx` — app entry point
- `app/globals.css` — design system, components and responsive styling
- `components/App.tsx` — page experiences, local state and interactions
- `components/StationMap.tsx` — dynamically imported Leaflet map
- `lib/data.ts` — shared models and sample stations/bookings
- `public/ev-grid-logo.png` — logo based on supplied asset

## Backend handoff

Replace local state in `components/App.tsx` with typed service calls to FastAPI and Supabase/PostgreSQL. Enforce authentication, RBAC, booking conflict prevention, approved station locations, pricing, and payment verification on the backend. Never trust client-side role selection for production authorization.

