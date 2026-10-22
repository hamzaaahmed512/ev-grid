# EV Grid — Complete Project Roadmap

Planning baseline: 15 October 2026. Follow the phases in order; use [TODO.md](TODO.md) for the execution checklist. This is a proposed implementation plan based on the repository, not a claim that the service has been deployed or verified in production.

## 1. Product goal and scope

Build a Pakistan-focused EV charging marketplace where drivers discover compatible chargers and reserve slots, private hosts share chargers, businesses manage multiple stations, and administrators oversee access and listings.

The first usable release must support authenticated accounts, trustworthy station information, vehicle compatibility, persistent reservations, host availability, and administrative moderation. Online payments and advanced recommendations are later milestones unless made launch requirements. Charging hardware control is a separate future integration; a reservation alone does not start a physical charging session.

## 2. Current position

- Frontend: Next.js 15, React 19 and TypeScript, with public pages and driver, host, business and admin workspaces. Leaflet maps and Recharts charts are present.
- Demo behavior: stations, bookings, favorites, account details and charts largely use local sample data or component state. Login and role selection demonstrate navigation rather than enforce identity or permissions.
- Backend: FastAPI and SQLAlchemy with health, station-list and station-detail endpoints. The frontend station shape is richer than the current station API/model.
- Database: PostgreSQL SQL migrations for users, vehicles, stations, connectors and bookings, plus station/connector seeds. Migration 006 deletes station/connector data and resets sequences; it needs a safe replacement strategy before use with persistent user data.
- Quality: a responsive audit and browser-check scripts exist. Its recorded results are historical evidence, not a current test run.
- Documentation: the root README is minimal; several planning/build documents are empty. Data and ML folders exist, but their presence does not establish a trained recommendation system.

## Language and module allocation

Project decision: use **C# for DSA (Data Structures and Algorithms)** and **Python for IDS (assumed here to mean Introduction to Data Science)**. The following is the planned allocation; the C# module is new work, not an existing implementation.

- **Frontend — TypeScript/TSX, HTML and CSS:** Next.js/React public pages, authentication screens, driver/host/business/admin workspaces, forms, maps and charts. The frontend displays results returned by the backend.
- **Application backend — Python:** FastAPI endpoints, authentication integration, permissions, station/vehicle/favorite management, booking orchestration, pricing rules, notifications and payment integration. Keep the existing Python backend as the main application API.
- **Database — PostgreSQL SQL:** tables, migrations, constraints, indexes, transactional booking conflict prevention and reporting queries. SQL remains the authority for preventing double bookings across simultaneous requests.
- **DSA module — C#:** implement and demonstrate station searching/sorting, top-k selection using a heap/priority queue, connector lookup using hash-based collections, and interval searching for candidate booking slots. Document time/space complexity and compare results with small reference datasets. Graph-based shortest-path routing can be added later only when a valid road graph and routing scope exist; straight-line distance is not road travel distance.
- **IDS module — Python:** data collection/import, cleaning, missing-value handling, exploratory data analysis, feature preparation, visualizations, baseline recommendation scoring and optional ML training/evaluation. Record dataset sources, train/test splits and reproducible results. Python produces recommendation scores; C# can select/order the top-k results without duplicating model logic.
- **Quality and tooling — matched to the module:** TypeScript/JavaScript for frontend/browser checks, Python for API and IDS tests, C#/.NET for algorithm tests/benchmarks, and SQL for database verification.
- **Documentation — Markdown:** requirements, architecture, DSA explanations, IDS findings, setup instructions and verification evidence.

**Integration plan:** add a separate `dsa/` C#/.NET module with a narrow internal HTTP API. Next.js calls FastAPI; FastAPI calls C# for the selected algorithm operations and calls/imports Python IDS code for recommendation scores. Exchange validated JSON containing stable station IDs and documented units. Keep the C# service internal, set timeouts and define explicit error handling. DSA availability checks identify candidates; FastAPI and PostgreSQL perform the final transactional booking validation. Place Python IDS work in `ml_training/` and documented datasets in `data/`; agree final package structure during phase 0.

**Language by phase:** phase 0 uses Markdown and configuration; phase 1 uses SQL plus Python models/schemas; phase 2 uses Python and TypeScript; phase 3 uses Python, TypeScript/CSS, SQL and C# discovery algorithms; phase 4 uses Python, SQL, TypeScript and C# candidate-slot algorithms; phase 5 uses Python, SQL and TypeScript/CSS; phase 6 uses Python, SQL and TypeScript; phase 7 uses Python IDS with C# top-k selection and TypeScript presentation; phases 8–9 validate and deploy all applicable modules using their respective toolchains.

## 3. Delivery phases

### Phase 0 — Establish requirements and a reproducible baseline

Confirm the launch scope, role permissions, station ownership, booking rules, supported connectors, cancellation rules and pricing units. Decide whether launch uses manual settlement or an online provider. Document architecture, environment setup and the difference between demonstration data and operational data. Record current build and API results.

Confirm the IDS course meaning/deliverables and C# DSA algorithm requirements. Define the Python-to-C# contract and local startup before integrating discovery algorithms.

**Exit gate:** a new developer can start the frontend, API and a disposable database using documented steps; product rules and launch acceptance criteria are written down.

### Phase 1 — Make the data model and migrations safe

Choose one migration mechanism and track applied versions. Separate schema upgrades from development seed resets. Reconcile frontend fields with database records: owner/business, station type, connectors, opening hours, amenities, tariffs and verification metadata. Add role memberships, organizations, availability, favorites and booking price snapshots as needed. Validate imported station coordinates and connector relationships; record sources and last verification dates.

Use database constraints for required relationships, valid coordinates, positive power, nonnegative prices, permitted statuses and valid booking time ranges. Preserve booking history when listings are removed. Store booking instants consistently and display them in Asia/Karachi; define how recurring local opening hours are represented.

**Exit gate:** clean installation and upgrade from the existing schema work on a disposable database without unintended data loss; frontend/API contracts agree.

### Phase 2 — Implement identity and authorization

Choose managed authentication or implement secure password hashing, registration, login, logout, verification and password recovery. Bind sessions to real user records. Enforce permissions and ownership on the server for drivers, hosts, business members and admins. Public registration must never grant admin privileges. Remove or isolate demo role switching from production.

**Exit gate:** authenticated sessions survive reloads, logout revokes access as designed, and users cannot access another user's private records or manage another owner's stations.

### Phase 3 — Deliver real station discovery

Define validated API request/response schemas and consistent error responses. Add paginated search and filters for location, city, connector, power, price, station type and availability. Return connector details and opening hours without inventing unknown values. Integrate the frontend through a shared API client with loading, empty, error and retry states. Support vehicle profiles and favorites. Refactor the large App component into feature components and usable routes as integration proceeds.

Implement the agreed discovery DSA operations in C# and integrate them through FastAPI. Retain database-side filtering/pagination where appropriate; do not fetch every station merely to demonstrate an algorithm.

Separate listed, verified, operational and bookable status. Use live-availability wording only when backed by an actual status source. Derive coverage counts from records, and request geolocation only when the driver uses nearby search.

**Exit gate:** the map, lists and station details use the same persisted records; filters and favorites work after reload; unknown prices or availability remain clearly unknown.

### Phase 4 — Complete the reservation lifecycle

Model bookable connector slots, recurring schedules, closures and maintenance. Implement create, list, detail, cancel, host approval where required, completion and no-show flows with explicit allowed transitions. Enforce opening hours, connector compatibility, future dates, duration limits and ownership on the server.

Implement candidate-slot interval algorithms in C# with boundary tests and complexity notes. Keep authoritative concurrency protection in PostgreSQL.

Prevent overlapping active reservations atomically in PostgreSQL; a frontend availability check is insufficient. Handle retries without duplicate reservations and define hold/approval expiry. Persist immutable tariff and estimate inputs. Estimate energy from effective charging power and duration, accounting for vehicle limits; distinguish estimated energy/cost from metered charges. Never multiply a per-kWh tariff by hours alone.

**Exit gate:** two simultaneous requests for one connector/time cannot both succeed; bookings survive reloads; cancellation and expiry release capacity correctly; displayed prices have consistent units.

### Phase 5 — Complete host and business operations

Persist listing creation/editing, connector management, tariffs, schedules, closures and booking decisions. Support multiple business locations and scoped membership. Add listing review and suspension controls for admins. Compute utilization and earnings from recorded reservations or actual sessions; label estimates and distinguish gross revenue from payable earnings.

**Exit gate:** a host can publish an approved listing and manage its reservations; a business can manage several locations without seeing another business's private data.

### Phase 6 — Add payments and communications

For a manual-settlement pilot, explicitly label payment collection and avoid implying that online payment occurred. For online payments, choose a provider suitable for the intended market, use hosted payment collection, verify signed webhooks and handle duplicate/out-of-order events. Define payment holds, failures, refunds, reconciliation and host settlement records before presenting paid status.

Add real email delivery for verification, recovery and booking changes, with retries and delivery logging. Connect support inquiries to persistent tickets or a delivery service. Persist notification preferences and obtain required consent.

**Exit gate:** the selected settlement path is truthful and auditable; if online payment is enabled, sandbox success, failure, duplicate webhook and refund scenarios all pass.

### Phase 7 — Deliver useful recommendations

Start with an explainable ranking based on connector compatibility, location, availability and estimated cost. Let drivers understand why a station ranks well. Treat machine learning as optional: first collect consented, documented data, define a baseline and evaluation metrics, prevent train/test leakage and measure improvement. Avoid claims about travel time, reliability or live availability without supporting data.

Complete the Python IDS deliverables even if ML is deferred: a documented cleaned dataset, exploratory analysis, plots and a reproducible baseline evaluation. Use the C# top-k algorithm to order/select scored candidates through the agreed contract.

**Exit gate:** incompatible or closed chargers are excluded where known; ranking is reproducible and useful; any model improves on the baseline before activation.

### Phase 8 — Harden and validate the release

Build focused backend, database and browser coverage for identity, permissions, discovery, booking races and settlement behavior. Re-run mobile, keyboard, focus and accessibility checks after integration. Measure performance against an agreed budget. Configure request validation, rate limits, restricted CORS, secret management, safe logging, backups and restore drills. Add CI for frontend type checking/build and backend/database tests.

**Exit gate:** release checks pass; critical security and booking defects are resolved; monitoring and a tested restore procedure exist.

### Phase 9 — Stage, pilot and launch

Deploy separate staging and production environments with managed configuration and a documented migration procedure. Run complete role-based acceptance scenarios in staging. Pilot with a small set of verified hosts and drivers. Define support ownership, incident handling, rollback and success metrics such as reservation completion, failed bookings and support issues. Expand only after pilot acceptance.

**Exit gate:** the pilot meets written acceptance criteria; production smoke tests pass; operators can detect failures, restore data and roll back the application safely.

## 4. Release boundaries and dependencies

- **Persistent MVP:** phases 0–5 plus release hardening and staging gates from phases 8–9. Manual settlement must be explicit. Implement authentication email/recovery from phase 6 before public account launch.
- **Commercial release:** MVP plus online payments, refunds, reconciliation and communications from phase 6.
- **Recommendation release:** phase 7 after discovery and booking data are reliable. Machine learning is optional and must not block a useful baseline ranking.
- **Future expansion:** physical charger/OCPP integration, metered sessions, route planning, dynamic tariffs, fleet tools and additional markets require separate requirements and validation.

The critical path is requirements → schema → identity → discovery → atomic bookings → owner operations → release validation → pilot. Payment work depends on stable booking/pricing rules; analytics depend on real transactions; ML depends on sufficient quality data. Estimate calendar dates after phase 0 establishes team capacity and provider constraints.

## 5. Working agreement

Complete tasks in TODO.md in numbered order unless an explicit dependency allows parallel work. Keep each change reviewable. Update decisions in docs/decisions.md, setup in docs/build-guide.md and actual verification evidence in docs/results.md. Mark a task complete only after its acceptance condition is demonstrated. Revisit this roadmap after each phase gate.
