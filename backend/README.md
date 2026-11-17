# EV Grid — Backend API

FastAPI backend for the EV Grid platform. Connects to a Supabase/PostgreSQL database via SQLAlchemy.

---

## Setup

```bash
cd backend
python -m venv venv
.\venv\Scripts\activate        # Windows
pip install -r requirements.txt
cp .env.example .env           # fill in SUPABASE_URL, SUPABASE_KEY, DATABASE_URL, SUPABASE_JWT_SECRET
uvicorn app.main:fastapi_app --reload
```

---

## Running Tests

Tests use an **isolated SQLite in-memory database**. They never touch the real Supabase DB.

```bash
cd backend
.\venv\Scripts\python.exe -m pytest tests/ -v
```

Expected baseline: **60 passed, 8 failed** (the 8 failures are pre-existing in `test_google_auth.py` and `test_sessions_api.py` and are unrelated to the Owner API).

---

## Roles

| Role value | Who |
|---|---|
| `driver` | Regular EV driver (default on signup) |
| `business_owner` | Station owner / business operator |

Role is stored in `users.role` (PostgreSQL) and carried in the Supabase JWT claim. Endpoints that require a specific role use FastAPI `Depends()` guards defined in `app/core/dependencies.py`.

---

## Public Driver API

| Method | Path | Description |
|---|---|---|
| `GET` | `/stations` | List all active stations with active connectors |
| `GET` | `/stations/{id}` | Single station detail |
| `GET` | `/stations/compatible` | Filter stations by vehicle connector compatibility |
| `GET` | `/bookings` | Driver's own bookings |
| `POST` | `/bookings` | Create a booking |
| `GET` | `/vehicles` | Driver's registered vehicles |
| `POST` | `/vehicles` | Register a vehicle |

---

## Owner API  *(Part 2 — Station Owner / Business Owner Module)*

> **Auth required:** `Authorization: Bearer <supabase_jwt>` with `users.role = 'business_owner'`.  
> An owner can only see and manage **their own** stations. Accessing another owner's resource returns **404** (not 403) — isolation is enforced at the query level.

### Station Endpoints

#### `GET /owner/stations`
List own stations (paginated). Returns stations where `owner_id = current_user.id` and `is_active = true`.

**Query params:**
| Param | Type | Default | Description |
|---|---|---|---|
| `page` | int | 1 | Page number |
| `page_size` | int | 20 | Items per page (max 100) |

**Response `200`:**
```json
{
  "stations": [
    {
      "id": 1,
      "name": "My Downtown Hub",
      "type": "B2P",
      "address": "123 Main St",
      "city": "Karachi",
      "latitude": 24.8607,
      "longitude": 67.0105,
      "open_time": "08:00:00",
      "close_time": "22:00:00",
      "rating": 4.5,
      "is_active": true,
      "connector_count": 3,
      "created_at": "2026-11-01T10:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 20
}
```

---

#### `POST /owner/stations`
Create a new station. `type` is always forced to `"B2P"` regardless of input.

**Request body:**
```json
{
  "name": "My Station",
  "address": "456 EV Road",
  "city": "Lahore",
  "latitude": 31.5204,
  "longitude": 74.3587,
  "open_time": "07:00",
  "close_time": "23:00",
  "price_per_kwh": 45.0
}
```

**Validation:**
- `name`: 3–100 characters, required
- `latitude`: −90 to 90
- `longitude`: −180 to 180
- `open_time` must be earlier than `close_time` (if both provided)
- `price_per_kwh`: 0–1000 (optional, defaults to 0)

**Response `201`:** Full station detail (see `GET /owner/stations/{id}`)

---

#### `GET /owner/stations/{id}`
Get a single station with its active connectors.

**Response `200`:**
```json
{
  "id": 1,
  "name": "My Downtown Hub",
  "type": "B2P",
  "address": "123 Main St",
  "city": "Karachi",
  "latitude": 24.8607,
  "longitude": 67.0105,
  "open_time": "08:00:00",
  "close_time": "22:00:00",
  "rating": 4.5,
  "is_active": true,
  "created_at": "2026-11-01T10:00:00Z",
  "connectors": [
    {
      "id": 10,
      "station_id": 1,
      "label": "Bay 1",
      "connector_type": "CCS2",
      "charging_type": "DC",
      "power_kw": 50.0,
      "price_per_kwh": 45.0,
      "status": "AVAILABLE",
      "is_active": true,
      "last_seen": null,
      "created_at": "2026-11-01T10:05:00Z"
    }
  ]
}
```

**Errors:** `404` if station not found or belongs to another owner.

---

#### `PUT /owner/stations/{id}`
Update station details. All fields are optional (partial update).

**Request body (all optional):**
```json
{
  "name": "Updated Name",
  "address": "New Address",
  "city": "Islamabad",
  "latitude": 33.6844,
  "longitude": 73.0479,
  "open_time": "06:00",
  "close_time": "23:59",
  "price_per_kwh": 50.0
}
```

**Response `200`:** Updated station detail.

---

#### `DELETE /owner/stations/{id}`
Soft-delete a station (`is_active = false`).

- Returns **409 Conflict** if any **future `CONFIRMED` bookings** exist for connectors at this station.
- Sets `is_active = false` on the station (connectors remain unchanged).

**Response `200`:**
```json
{ "message": "Station deactivated successfully" }
```

---

### Connector Endpoints

#### `POST /owner/stations/{station_id}/connectors`
Add a connector to a station.

**Limits (domain rule):**
- `B2P` station: max **6** active connectors
- `P2P` station: max **1** active connector
- Returns **409 Conflict** if limit reached.

**Request body:**
```json
{
  "label": "Bay 1",
  "connector_type": "CCS2",
  "power_kw": 50.0,
  "price_per_kwh": 45.0
}
```

**Accepted `connector_type` values** (case-insensitive, normalised on input):

| Input variants | Stored as |
|---|---|
| `"Type 2"`, `"type2"`, `"Type2"` | `"Type 2"` |
| `"CCS2"`, `"ccs2"` | `"CCS2"` |
| `"CCS1"`, `"ccs1"` | `"CCS1"` |
| `"CHAdeMO"`, `"chademo"` | `"CHAdeMO"` |
| `"GBT"`, `"gbt"` | `"GBT"` |
| `"Tesla"`, `"tesla"` | `"Tesla"` |

**Validation:**
- `power_kw`: 1–400 kW
- `price_per_kwh`: 0–1000 (optional; falls back to station's `price_per_kwh`)
- `label`: 1–50 characters (optional)

**`charging_type` auto-detection:** `Type 2`, `Type 1`, `Socket` → `"AC"`; all others → `"DC"`.

**Response `201`:** Full connector detail (`OwnerConnectorResponse`).

---

#### `PUT /owner/connectors/{id}`
Update a connector's label, type, power, or price.

**Request body (all optional):**
```json
{
  "label": "Bay 2",
  "connector_type": "CHAdeMO",
  "power_kw": 100.0,
  "price_per_kwh": 55.0
}
```

**Response `200`:** Updated connector detail.

---

#### `PATCH /owner/connectors/{id}/status`
Set a connector's operational status.

**Allowed values:** `AVAILABLE`, `OFFLINE`, `DISABLED`  
**Not allowed (returns `400`):** `CHARGING`, `FAULT` — these are set by the system/charger, not the owner.

Every successful call writes a row to the `status_logs` table recording the old status, new status, timestamp, and `changed_by_user_id`.

**Request body:**
```json
{ "status": "OFFLINE" }
```

**Response `200`:** Updated connector detail.

---

#### `DELETE /owner/connectors/{id}`
Soft-delete a connector (`is_active = false`).

- Returns **409 Conflict** if any **future `CONFIRMED` bookings** exist for this connector.

**Response `200`:**
```json
{ "message": "Connector deactivated successfully" }
```

---

## Status Logs

The `status_logs` table records every owner-initiated status change:

| Column | Type | Description |
|---|---|---|
| `id` | int | PK |
| `point_id` | int | FK → `connectors.id` |
| `old_status` | varchar | Status before change |
| `new_status` | varchar | Status after change |
| `changed_at` | timestamptz | UTC timestamp |
| `changed_by_user_id` | int | FK → `users.id` (nullable) |

---

## Project Structure

```
backend/
├── app/
│   ├── core/
│   │   ├── dependencies.py     # get_current_user, require_business_owner
│   │   └── security.py         # JWT decode, Supabase auth helpers
│   ├── models/
│   │   ├── station.py          # Station SQLAlchemy model
│   │   ├── connector.py        # Connector SQLAlchemy model
│   │   ├── status_log.py       # StatusLog model (status_logs table)
│   │   ├── user.py             # User model
│   │   └── booking.py          # Booking model
│   ├── routers/
│   │   ├── owner.py            # Owner API endpoints (Part 2)
│   │   └── stations.py         # Public driver-facing station endpoints
│   ├── schemas/
│   │   └── owner.py            # Pydantic schemas + validation for Owner API
│   ├── services/
│   │   └── owner_service.py    # Business logic for Owner API
│   └── main.py
├── tests/
│   ├── test_owner_api.py       # 14 Owner API tests (all isolated, SQLite in-memory)
│   └── ...
├── requirements.txt
└── README.md
```
