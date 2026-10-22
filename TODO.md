# EV Grid — Ordered Implementation Tasks

Companion: [ROADMAP.md](ROADMAP.md). Created 15 October 2026.

All boxes below represent proposed work that still needs verification or implementation. Existing demo screens do not count as completed backend functionality. Work from top to bottom; finish each phase gate before dependent phases. Record test evidence in docs/results.md and decisions in docs/decisions.md.

## Phase 0 — Requirements and setup

**Languages:** Markdown/configuration. Confirm architecture for TypeScript frontend, Python API/IDS, C# DSA and PostgreSQL SQL.

- [ ] 01. Inventory every screen/action and classify it as demo, persistent or missing; include all four roles and public pages.
- [ ] 02. Agree launch scope: persistent MVP, manual/online settlement, host approval rules and recommendation expectations.
- [ ] 03. Write role/ownership permissions, business membership rules and listing approval requirements.
- [ ] 04. Define connector compatibility, opening hours, slot duration, booking statuses, cancellation, expiry and no-show rules.
- [ ] 05. Define tariff units, estimated energy/cost, rounding and the difference between reservations and physical charging sessions.
- [ ] 06. Document frontend/API/database architecture, local startup, required environment variable names and development seed procedure; include a safe example without secrets.
- [ ] 07. Run the existing frontend typecheck/build and API smoke checks; record actual outcomes and baseline defects.
- [ ] 08. Write role-based MVP acceptance scenarios and confirm a fresh setup works from the documentation.
- [ ] 08a. Confirm IDS means Introduction to Data Science and list its required analysis/report deliverables; confirm required C# DSA algorithms and complexity explanations.
- [ ] 08b. Document module ownership and validated JSON contracts: frontend → Python FastAPI → internal C# DSA service; Python IDS supplies recommendation scores.
- [ ] 08c. Scaffold the C#/.NET `dsa/` project with a health endpoint and test project; document SDK requirements, configuration, local startup and service timeout/error behavior.

**Gate:** requirements, local setup and baseline evidence are available.

## Phase 1 — Database and contracts

**Languages:** PostgreSQL SQL for schema/constraints; Python for SQLAlchemy models and API schemas.

- [ ] 09. Back up any existing database before planning changes; inspect schema and migration history in a disposable environment.
- [ ] 10. Choose/version the migration runner and document ordered application and recovery procedures.
- [ ] 11. Replace the destructive reset behavior in migration 006 with a safe upgrade approach; isolate intentional resets in development-only seeds and preserve already-applied migration history.
- [ ] 12. Define canonical station, connector, vehicle, user and booking API schemas; map differences from frontend/lib/data.ts.
- [ ] 13. Add role memberships, business organizations and station ownership with required foreign keys and indexes.
- [ ] 14. Add station type, hours, amenities, tariffs, moderation/verification fields and connector details needed by the interface.
- [ ] 15. Add schedules, closures, favorites, booking price snapshots and lifecycle timestamps; choose a history-preserving deletion policy.
- [ ] 16. Add data constraints and timezone rules, including valid coordinates, positive power, nonnegative money and end-after-start checks.
- [ ] 17. Audit station seed sources, coordinates, connector mappings, duplicates and unknown tariffs; distinguish sample records from verified listings.
- [ ] 18. Verify fresh migrations, upgrades, seed repeatability and rollback/recovery on disposable databases.

**Gate:** schema upgrades preserve data and match documented API contracts.

## Phase 2 — Authentication and permissions

**Languages:** Python for authentication/authorization; TypeScript/TSX and CSS for frontend forms/session views; SQL for persistent account records.

- [ ] 19. Select the authentication approach and document session, cookie/token and cross-origin security behavior.
- [ ] 20. Implement registration, login, current-user lookup and logout with secure credential/session handling.
- [ ] 21. Implement email verification, expiring single-use recovery links and account enumeration protection; wire real delivery before public launch.
- [ ] 22. Add server-side role and ownership checks to protected endpoints; provision admin access through a controlled process.
- [ ] 23. Connect frontend forms and session loading to real authentication; provide useful failure and expiry states.
- [ ] 24. Remove production demo login/role switching and guard protected pages; keep authorization enforced by the API.
- [ ] 25. Verify invalid credentials, expired sessions, recovery reuse and cross-user/cross-business access denial.

**Gate:** identity and permissions work independently of frontend controls.

## Phase 3 — Discovery and driver data

**Languages:** Python API, TypeScript/TSX/CSS interface, SQL queries and C# DSA searching/sorting/lookup algorithms.

- [ ] 26. Add explicit response schemas, validated query parameters, pagination and consistent errors to station endpoints.
- [ ] 27. Implement station search/filtering and detail responses with connectors, tariffs, hours and verification status.
- [ ] 27a. Implement the agreed station search/sort and connector lookup algorithms in C#; add correctness tests, complexity notes and representative benchmarks.
- [ ] 27b. Integrate discovery DSA calls through FastAPI with validated JSON and timeout/error handling; retain efficient database filtering/pagination.
- [ ] 28. Implement authorized vehicle and favorite create/read/update/delete operations.
- [ ] 29. Add a shared frontend API client and environment-based API address, with loading/error/empty/retry states.
- [ ] 30. Split App.tsx into feature components and routes as flows are integrated; support refresh and direct navigation.
- [ ] 31. Replace production sample station data in cards, maps, public listings and detail views with API records.
- [ ] 32. Connect search, sorting, filters, vehicle profiles and favorites; request location only for nearby search and handle denial.
- [ ] 33. Derive coverage counts from real records and display unknown prices/status honestly; separate listing status from bookable capacity.
- [ ] 34. Verify map/list consistency, filters, pagination, unavailable API behavior and persistence after reload.

**Gate:** discovery and driver preferences use persisted, consistent data.

## Phase 4 — Bookings

**Languages:** Python for lifecycle/pricing APIs, SQL for transactions/conflict constraints, C# for candidate-slot interval algorithms and TypeScript/TSX for booking screens.

- [ ] 35. Implement availability calculation from connector schedules, closures and active reservations.
- [ ] 35a. Implement candidate-slot interval search in C# and test adjacent/overlapping intervals; document complexity. Treat its output as advisory until PostgreSQL confirms the reservation transaction.
- [ ] 36. Add a database-enforced strategy for overlapping connector bookings and transactional creation.
- [ ] 37. Implement authorized booking creation/list/detail endpoints with compatibility, time and opening-hour validation.
- [ ] 38. Implement cancellation, host approval/rejection if required, completion, no-show and hold/approval expiry transitions.
- [ ] 39. Make creation retries idempotent and ensure cancellations/expiry release capacity.
- [ ] 40. Calculate estimates from tariff × estimated kWh, effective power and duration; store immutable quote inputs and rounding rules.
- [ ] 41. Connect frontend booking, confirmation, history and cancellation to the API; replace fixed sample dates with valid selectable dates.
- [ ] 42. Verify concurrent same-slot requests, adjacent slots, duplicate requests, timezone boundaries, price changes and unauthorized transitions.

**Gate:** reservations are durable, correctly priced and cannot double-book a connector.

## Phase 5 — Hosts, businesses and administration

**Languages:** Python and SQL for management/aggregates; TypeScript/TSX and CSS for workspaces and charts.

- [ ] 43. Implement owned listing/connector creation and editing, including server validation and safe archival.
- [ ] 44. Persist recurring availability, closures, maintenance and tariff changes without rewriting historical booking prices.
- [ ] 45. Connect host listing forms, bookings, availability and charger controls to these endpoints.
- [ ] 46. Implement business membership and multi-location management with scoped queries and actions.
- [ ] 47. Implement admin listing review, suspension, user controls and audit records for sensitive actions.
- [ ] 48. Replace sample dashboards/charts with scoped aggregates; clearly distinguish estimated revenue, collected payments and payable earnings.
- [ ] 49. Verify a complete host onboarding → approved listing → driver reservation → completion journey and business isolation.

**Gate:** owners and administrators can operate the persistent marketplace.

## Phase 6 — Settlement and communications

**Languages:** Python for payment/delivery integrations, SQL for settlement/event records and TypeScript/TSX for payment/support interfaces.

- [ ] 50. Implement the agreed manual-settlement path or select an online payment provider and document booking/payment state transitions.
- [ ] 51. If online payments are in scope, add hosted checkout, provider references and signed, idempotent webhook processing.
- [ ] 52. If online payments are in scope, implement failures, expiry, refunds, reconciliation and host settlement accounting.
- [ ] 53. Send booking confirmations, changes and cancellations through a real delivery service with retries and delivery records.
- [ ] 54. Persist notification preferences and connect the contact form to support delivery or ticket storage.
- [ ] 55. Verify truthful manual-settlement labels or online sandbox success/failure/refund and duplicate/out-of-order webhook behavior; verify communication delivery.

**Gate:** the selected settlement path and customer messages work end to end. Mark online-only tasks deferred with a reason if the pilot uses manual settlement.

## Phase 7 — Recommendations

**Languages:** Python for IDS cleaning, EDA, features, scoring and optional ML; C# for top-k selection; TypeScript/TSX for recommendation presentation.

- [ ] 55a. In Python, document dataset provenance, clean missing/duplicate/invalid values and save a reproducible processed dataset without exposing personal data.
- [ ] 55b. Produce Python IDS exploratory analysis, plots and findings on station coverage, connector types, power and tariffs; separate measured facts from assumptions.

- [ ] 56. Define a baseline ranking using compatibility, distance, known availability and estimated cost.
- [ ] 57. Implement ranking with explicit handling of unknown fields and a visible explanation of recommendations.
- [ ] 57a. Implement/test heap or priority-queue top-k selection in C#; pass Python-generated station scores through the API contract and preserve stable station IDs and deterministic ties.
- [ ] 58. Verify known incompatible/closed listings are excluded and rankings remain deterministic for fixed inputs.
- [ ] 59. If ML is justified, define consented data collection, dataset provenance, evaluation metrics, held-out evaluation and a fallback baseline.
- [ ] 60. Train/evaluate an optional model and activate it only after demonstrated improvement; otherwise retain the baseline and record the decision.

**Gate:** useful recommendations exist; ML remains optional.

## Phase 8 — Release quality and operations

**Languages:** TypeScript/JavaScript frontend/browser checks, Python API/IDS tests, C#/.NET algorithm tests and SQL database checks; configuration files for CI.

- [ ] 61. Add CI for frontend typecheck/build, backend tests and PostgreSQL-backed migration/booking checks.
- [ ] 61a. Add C# build/tests and Python IDS reproducibility checks to CI; verify Python-to-C# contract compatibility and service failure behavior.
- [ ] 62. Add focused browser scenarios for each role, authentication, discovery, listing creation and booking/cancellation.
- [ ] 63. Re-run responsive scripts and verify keyboard navigation, focus handling, form errors, contrast and screen-reader labels.
- [ ] 64. Measure performance with realistic station volumes; address slow queries, large bundles and map rendering against agreed targets.
- [ ] 65. Review authorization, validation, rate limits, CORS, session/CSRF behavior, dependency risks and secret-safe logs.
- [ ] 66. Configure health/readiness checks, error monitoring, request identifiers and operational alerts.
- [ ] 67. Configure database backups, retention and a tested restore process; document migration and application rollback limitations.
- [ ] 68. Resolve release-blocking defects and record actual check results plus remaining limitations.

**Gate:** release acceptance checks pass and recovery is demonstrated. For MVP, perform this phase before launch even if later commercial/ML features are deferred.

## Phase 9 — Deployment and pilot

**Languages/toolchains:** deploy Next.js/TypeScript frontend, Python FastAPI/IDS runtime, internal C#/.NET DSA service and PostgreSQL database; maintain Markdown operations guides.

- [ ] 69. Configure separate staging/production database, API and frontend environments with managed secrets and HTTPS.
- [ ] 69a. Deploy the C# DSA service with internal-only access and health monitoring; configure FastAPI connectivity and verify the complete frontend → Python → C# request path in staging.
- [ ] 70. Deploy to staging, apply reviewed migrations and run all role-based acceptance journeys using non-production data.
- [ ] 71. Prepare accurate privacy/terms, listing verification guidance, support ownership and incident/rollback instructions for the intended launch.
- [ ] 72. Pilot with a limited group of verified hosts/drivers; track completed reservations, failures, cancellations and support issues.
- [ ] 73. Fix pilot blockers and confirm the written launch acceptance criteria are met.
- [ ] 74. Release production, run smoke checks and verify monitoring, backups and support coverage.
- [ ] 75. Review pilot/launch outcomes, prioritize the next backlog and update both planning files.

**Gate:** a verified pilot and supported production release are complete.

## Start here

The immediate sequence is tasks 01–08, then migration safety and contract alignment in 09–18. Do not treat visual demo completion as a reason to skip identity, database or booking checks. When a task is finished, mark its box and link the implementation or verification evidence in the project documentation.
