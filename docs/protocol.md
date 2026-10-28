# VoltRelay — TCP Charger Protocol Contract

**Module 5: TCP Charger Simulator + Live Status Gateway (Part 1)**
**Protocol Version:** `1.0.0`
**Status:** Canonical Interface Specification

---

## 1. Overview & Architectural Scope

This specification establishes the communication contract between simulated/physical EV charging hardware and the **VoltRelay Live Status Gateway**.

```text
+-----------------------+                    +-------------------------+
| Simulated Charger /   |                    | VoltRelay TCP Gateway   |
| Hardware Client       |                    | (Port 9000)             |
+-----------------------+                    +-------------------------+
           |                                              |
           | ----- Persistent TCP Handshake ------------> |
           | ----- BOOT (Firmware & Capabilities) ------> |
           | <---- ACK (ok: true) ----------------------- |
           |                                              |
           | ===== Periodic Liveness (Every 10s) ======== |
           | ----- HEARTBEAT ---------------------------> |
           | <---- ACK (ok: true) ----------------------- |
           |                                              |
           | ===== Charging Session Lifecycle =========== |
           | ----- STATUS (AVAILABLE -> OCCUPIED) ------> |
           | ----- SESSION_START (booking_id?) ---------> |
           | <---- ACK (ok: true, session_id: 42) ------- |
           |                                              |
           | ----- METER (kWh, kW, SoC, Temp) ----------> |
           | <---- ACK (ok: true) ----------------------- |
           |                                              |
           | <==== REMOTE_STOP (Optional server abort) == |
           | ----- SESSION_STOP (total_kwh, reason) ----> |
           | <---- ACK (ok: true, session_id: 42) ------- |
           |                                              |
           | ----- STATUS (OCCUPIED -> AVAILABLE) ------> |
           |                                              |
```

### Scope Demarcation

* **In Scope for Part 1:** The transport rules, wire framing, common envelope, message payload schemas, state transition invariants, and validation examples specified in this document.
* **Deferred to Subsequent Parts:** Concrete TCP server implementation (FastAPI / `asyncio`), simulator runtime daemon, WebSocket client broadcasting to the web interface, and session billing calculation engines.

---

## 2. Transport & Framing Rules

All implementations (both clients and gateways) **MUST** comply with the following low-level rules:

1. **Transport Layer:** Raw persistent TCP (Transmission Control Protocol).
2. **Default Port:** `9000` (configurable on the gateway via the `TCP_GATEWAY_PORT` environment variable).
3. **Character Encoding:** `UTF-8` strictly.
4. **Framing (NDJSON):** Every message **MUST** be serialized as a single, newline-delimited JSON document ending with a newline character (`\n`, ASCII `0x0A`). Gateways **MUST** accept and strip optional carriage returns (`\r\n`).
5. **One Message Per Line:** Multiple JSON objects on a single line are strictly forbidden. Empty lines or whitespace-only lines **MUST** be ignored without terminating the connection.
6. **Maximum Message Size:** Any single message line exceeding `65,536` bytes (64 KB) will result in immediate connection closure by the gateway to prevent buffer-exhaustion attacks.
7. **Connection Persistence:** Connections remain open indefinitely. The charger initiates the TCP socket on boot and maintains the socket across multiple charging sessions.

---

## 3. Common Message Envelope

Every message sent across the TCP connection—whether from charger to gateway or gateway to charger—**MUST** contain the following three envelope fields at the root of the JSON object:

| Field | Type | Description | Example |
| :--- | :--- | :--- | :--- |
| `type` | `string` | Uppercase discriminator identifying the message action. | `"BOOT"`, `"HEARTBEAT"`, `"ACK"` |
| `charger_id` | `string` | Stable unique identifier assigned to the simulated connector (e.g., from `connectors.charger_id`). | `"SIM-001"` |
| `ts` | `string` | ISO 8601 UTC timestamp with second or millisecond precision and a trailing `Z`. | `"2026-10-28T14:30:00Z"` |

### Envelope Example

```json
{
  "type": "HEARTBEAT",
  "charger_id": "SIM-001",
  "ts": "2026-10-28T14:30:00Z"
}
```

---

## 4. Charger-to-Gateway Messages (Inbound)

Chargers transmit six primary message types to report lifecycle, health, telemetry, and status changes.

---

### 4.1. `BOOT`

Transmitted immediately when the charger establishes or re-establishes a TCP connection with the gateway.

* **Purpose:** Registers hardware capabilities, firmware version, and announces the charger to the gateway.
* **Frequency:** Once upon connection establishment.

#### Field Specifications

| Field | In/Out | Type | Required? | Valid Values / Constraints | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `firmware_version` | Payload | `string` | **Required** | Non-empty string (e.g. `"v1.2.0"`) | Firmware release identifier. |
| `model` | Payload | `string` | **Required** | Non-empty string (e.g. `"VoltBox-50"`) | Hardware model name. |
| `vendor` | Payload | `string` | Optional | String | Manufacturer or vendor name. |
| `max_power_kw` | Payload | `number` | Optional | Decimal $> 0.0$ | Maximum rated output in kW. |
| `connector_types` | Payload | `array[string]` | Optional | e.g. `["CCS2"]`, `["Type 2"]` | Supported connector standards. |

#### JSON Example: `BOOT`

```json
{
  "type": "BOOT",
  "charger_id": "SIM-001",
  "ts": "2026-10-28T14:00:00Z",
  "firmware_version": "v2.1.0",
  "model": "VoltSim-DC-Fast",
  "vendor": "VoltRelay Labs",
  "max_power_kw": 120.0,
  "connector_types": ["CCS2", "CHAdeMO"]
}
```

#### Gateway Action

1. Validates that `charger_id` exists in the `connectors` database table.
2. Updates `connectors.last_seen = ts`.
3. Returns an `ACK` response (`ref_type: "BOOT"`, `ok: true`).

---

### 4.2. `HEARTBEAT`

Periodic keep-alive signal transmitted by the charger.

* **Purpose:** Confirms client liveness, socket health, and tracks connectivity.
* **Interval:** Sent precisely every **10 seconds** ($\pm 1$s).
* **Timeout Invariant:** If the gateway does not receive any message from a charger for **3 consecutive heartbeat intervals (30 seconds)**, the charger is marked `OFFLINE`.

#### Field Specifications

| Field | In/Out | Type | Required? | Valid Values / Constraints | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `uptime_seconds` | Payload | `integer` | Optional | $\ge 0$ | Total seconds since charger boot. |

#### JSON Example: `HEARTBEAT`

```json
{
  "type": "HEARTBEAT",
  "charger_id": "SIM-001",
  "ts": "2026-10-28T14:00:10Z",
  "uptime_seconds": 3600
}
```

#### Gateway Action

1. Updates `connectors.last_seen = ts`.
2. Resets the 30-second disconnect watchdog timer.
3. Returns an `ACK` response (`ref_type: "HEARTBEAT"`, `ok: true`).

---

### 4.3. `STATUS`

Transmitted whenever the operational readiness of the connector changes, or periodically to sync status.

* **Purpose:** Updates the database and broadcast layer on whether the connector is free, occupied, or faulted.
* **Frequency:** Triggered on state transitions, or as part of periodic sync.

#### Field Specifications

| Field | In/Out | Type | Required? | Valid Values / Constraints | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `status` | Payload | `string` | **Required** | `'AVAILABLE'`, `'OCCUPIED'`, `'FAULTED'` | Connector operational state. |
| `error_code` | Payload | `string` | Optional | e.g. `'NO_ERROR'`, `'GROUND_FAULT'`, `'OVER_TEMP'` | Diagnostic code when `FAULTED`. |
| `error_description` | Payload | `string` | Optional | Human-readable string | Detailed fault explanation. |

#### JSON Example: `STATUS` (Normal)

```json
{
  "type": "STATUS",
  "charger_id": "SIM-001",
  "ts": "2026-10-28T14:05:00Z",
  "status": "AVAILABLE"
}
```

#### JSON Example: `STATUS` (Faulted)

```json
{
  "type": "STATUS",
  "charger_id": "SIM-001",
  "ts": "2026-10-28T14:06:12Z",
  "status": "FAULTED",
  "error_code": "OVER_TEMP",
  "error_description": "Connector cable temperature sensor exceeded 85C threshold."
}
```

#### Gateway Action

1. Updates `connectors.status` to the specified value.
2. Updates `connectors.last_seen = ts`.
3. If `status` becomes `AVAILABLE` or `FAULTED`, resets `connectors.current_power_kw = 0.00`.
4. Returns an `ACK` response (`ref_type: "STATUS"`, `ok: true`).

---

### 4.4. `SESSION_START`

Transmitted when an electric vehicle connects and begins drawing power or is authorized to charge.

* **Purpose:** Creates a record in the `charging_sessions` database table, links optional reservations, and marks the connector as in-use.
* **Concurrency Protection:** A connector **MUST NOT** have more than one `ACTIVE` session at a time. The gateway will reject duplicate active session attempts with an error ACK.

#### Field Specifications

| Field | In/Out | Type | Required? | Valid Values / Constraints | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `booking_id` | Payload | `integer` | Optional | Null or existing `bookings.id` | Reservation ID for booked sessions. Null for walk-in drivers. |
| `user_id` | Payload | `integer` | Optional | Null or existing `users.id` | Driver initiating session. |
| `soc` | Payload | `number` | Optional | Decimal between $0.0$ and $100.0$ | Initial State of Charge (SoC %). |
| `id_tag` | Payload | `string` | Optional | Non-empty alphanumeric string | Driver RFID / app authorization token. |

#### JSON Example: `SESSION_START` (With Reservation)

```json
{
  "type": "SESSION_START",
  "charger_id": "SIM-001",
  "ts": "2026-10-28T14:10:00Z",
  "booking_id": 14,
  "user_id": 3,
  "soc": 22.5
}
```

#### JSON Example: `SESSION_START` (Walk-in Session)

```json
{
  "type": "SESSION_START",
  "charger_id": "SIM-001",
  "ts": "2026-10-28T14:10:00Z",
  "booking_id": null,
  "user_id": null,
  "soc": 18.0
}
```

#### Gateway Action

1. Checks if the connector currently has an `ACTIVE` record in `charging_sessions`.
   * If yes: Returns `ACK` with `ok: false`, `error: "SESSION_ALREADY_ACTIVE"`.
2. If `booking_id` is supplied:
   * Verifies the booking exists and belongs to this connector/station.
   * Updates `bookings.status = 'IN_PROGRESS'`.
3. Inserts a new record into `charging_sessions` with:
   * `connector_id = <resolved_connector_id>`
   * `booking_id = booking_id`
   * `user_id = user_id`
   * `status = 'ACTIVE'`
   * `started_at = ts`
   * `soc_start = soc`
   * `kwh_delivered = 0.0000`
   * `peak_power_kw = 0.00`
   * `cost = 0.00`
4. Updates `connectors.status = 'OCCUPIED'`.
5. Returns `ACK` with `ref_type: "SESSION_START"`, `ok: true`, and the newly generated database `session_id`.

---

### 4.5. `METER`

Periodic telemetry telemetry updates dispatched while a charging session is actively running.

* **Purpose:** Streams instantaneous power, cumulative energy, battery State of Charge, and temperature diagnostics to the gateway.
* **Interval:** Every **5 to 10 seconds** throughout the active session.

#### Field Specifications

| Field | In/Out | Type | Required? | Valid Values / Constraints | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `session_id` | Payload | `integer` | **Required** | Must match the active `charging_sessions.id` | Session identifier assigned during `SESSION_START`. |
| `kwh_delivered` | Payload | `number` | **Required** | Decimal $\ge 0.0$ | Cumulative energy delivered during this session (in kWh). |
| `power_kw` | Payload | `number` | **Required** | Decimal $\ge 0.0$ | Current instantaneous charging power in kW. |
| `soc` | Payload | `number` | Optional | Decimal between $0.0$ and $100.0$ | Current vehicle battery State of Charge (%). |
| `temperature_c` | Payload | `number` | Optional | Decimal (e.g. $-20.0$ to $120.0$) | Internal connector/cable temperature in Celsius. |
| `voltage_v` | Payload | `number` | Optional | Decimal $\ge 0.0$ | Line voltage in Volts (e.g., $398.5$). |
| `current_a` | Payload | `number` | Optional | Decimal $\ge 0.0$ | Charging current in Amperes (e.g., $112.4$). |

#### JSON Example: `METER`

```json
{
  "type": "METER",
  "charger_id": "SIM-001",
  "ts": "2026-10-28T14:15:30Z",
  "session_id": 42,
  "kwh_delivered": 12.4500,
  "power_kw": 48.60,
  "soc": 45.2,
  "temperature_c": 36.8
}
```

#### Gateway Action

1. Validates that `session_id` exists and has `status = 'ACTIVE'`.
2. Updates `charging_sessions` for `session_id`:
   * `kwh_delivered = kwh_delivered`
   * `peak_power_kw = GREATEST(peak_power_kw, power_kw)`
   * `soc_end = soc`
   * Computes updated `cost = kwh_delivered * connector.price_per_kwh`.
3. Updates `connectors`:
   * `current_power_kw = power_kw`
   * `last_seen = ts`
4. Returns `ACK` with `ref_type: "METER"`, `ok: true`, `session_id: 42`.

---

### 4.6. `SESSION_STOP`

Transmitted when a charging session terminates due to normal completion, user unplugging, fault, or remote command.

* **Purpose:** Finalizes the `charging_sessions` record, records the total delivered energy, settles session cost, and frees the connector.

#### Field Specifications

| Field | In/Out | Type | Required? | Valid Values / Constraints | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `session_id` | Payload | `integer` | **Required** | Must match target `charging_sessions.id` | Session identifier being stopped. |
| `total_kwh` | Payload | `number` | **Required** | Decimal $\ge 0.0$ | Final cumulative energy delivered in kWh. |
| `stop_reason` | Payload | `string` | **Required** | See allowed stop reasons below | Reason charging was halted. |
| `soc_end` | Payload | `number` | Optional | Decimal between $0.0$ and $100.0$ | Final State of Charge (%) at unplug. |

#### Permitted `stop_reason` Values

* `"EV_DISCONNECTED"` — Physical vehicle unplugged or charging port unlatched.
* `"FULL_BATTERY"` — Vehicle BMS signaled battery capacity reached 100% or user target.
* `"LOCAL_STOP"` — Driver pressed the stop button on the physical charger / touchscreen.
* `"REMOTE_STOP"` — Stopped by gateway command (e.g. mobile app cancellation).
* `"BOOKING_EXPIRED"` — Reservation slot time window elapsed.
* `"FAULT"` — Session aborted due to an emergency condition or hardware error.

#### JSON Example: `SESSION_STOP`

```json
{
  "type": "SESSION_STOP",
  "charger_id": "SIM-001",
  "ts": "2026-10-28T14:45:00Z",
  "session_id": 42,
  "total_kwh": 34.2500,
  "stop_reason": "FULL_BATTERY",
  "soc_end": 100.0
}
```

#### Gateway Action

1. Validates that `session_id` exists and is currently `'ACTIVE'`.
2. Updates `charging_sessions`:
   * `status = ('FAULTED' if stop_reason == 'FAULT' else 'COMPLETED')`
   * `ended_at = ts`
   * `kwh_delivered = total_kwh`
   * `soc_end = soc_end`
   * `stop_reason = stop_reason`
   * Computes final `cost = total_kwh * connector.price_per_kwh`.
3. If session had an associated `booking_id`:
   * Updates `bookings.status = 'COMPLETED'`.
4. Updates `connectors`:
   * `status = 'AVAILABLE'` (or `'FAULTED'` if stop_reason was `'FAULT'`)
   * `current_power_kw = 0.00`
   * `last_seen = ts`
5. Returns `ACK` with `ref_type: "SESSION_STOP"`, `ok: true`, `session_id: 42`.

---

## 5. Gateway-to-Charger Messages (Outbound)

The gateway communicates back to chargers over the same persistent TCP socket.

---

### 5.1. `ACK`

Standard transactional acknowledgement returned by the gateway for every inbound charger message.

* **Purpose:** Informs the charger whether its transmission was accepted and stored, and provides server-generated IDs (such as `session_id`).
* **Delivery:** Synchronous response to each inbound message.

#### Field Specifications

| Field | In/Out | Type | Required? | Valid Values / Constraints | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `ref_type` | Payload | `string` | **Required** | The inbound message `type` being acknowledged | Mirrors inbound type (e.g. `"BOOT"`, `"SESSION_START"`). |
| `ok` | Payload | `boolean` | **Required** | `true` or `false` | Success status indicator. |
| `session_id` | Payload | `integer` | Optional | Integer | Returned on `SESSION_START`, `METER`, `SESSION_STOP`. |
| `error` | Payload | `string` | Optional | e.g. `'UNKNOWN_CHARGER'`, `'SESSION_ALREADY_ACTIVE'` | Standardized error code if `ok: false`. |
| `message` | Payload | `string` | Optional | Human-readable explanation | Diagnostic text if `ok: false`. |

#### JSON Example: Successful `SESSION_START` ACK

```json
{
  "type": "ACK",
  "charger_id": "SIM-001",
  "ts": "2026-10-28T14:10:01Z",
  "ref_type": "SESSION_START",
  "ok": true,
  "session_id": 42
}
```

#### JSON Example: Successful `HEARTBEAT` ACK

```json
{
  "type": "ACK",
  "charger_id": "SIM-001",
  "ts": "2026-10-28T14:00:10Z",
  "ref_type": "HEARTBEAT",
  "ok": true
}
```

#### JSON Example: Error ACK (Duplicate Active Session)

```json
{
  "type": "ACK",
  "charger_id": "SIM-001",
  "ts": "2026-10-28T14:10:05Z",
  "ref_type": "SESSION_START",
  "ok": false,
  "error": "SESSION_ALREADY_ACTIVE",
  "message": "Connector SIM-001 already has active session 42. Terminate existing session first."
}
```

---

### 5.2. `REMOTE_STOP`

Asynchronous command sent from gateway to charger to abort an ongoing charging session.

* **Purpose:** Triggered by user app action, host override, admin intervention, or emergency shutdown.
* **Charger Response:** Upon receiving this message, the charger **MUST** safely ramp down current, unlock the latch, and send a `SESSION_STOP` message with `stop_reason: "REMOTE_STOP"`.

#### Field Specifications

| Field | In/Out | Type | Required? | Valid Values / Constraints | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `session_id` | Payload | `integer` | **Required** | Must match active session ID | Target session to abort. |
| `reason` | Payload | `string` | Optional | e.g. `'USER_APP_REQUEST'`, `'ADMIN_SHUTDOWN'` | Contextual reason for termination. |

#### JSON Example: `REMOTE_STOP`

```json
{
  "type": "REMOTE_STOP",
  "charger_id": "SIM-001",
  "ts": "2026-10-28T14:35:00Z",
  "session_id": 42,
  "reason": "USER_APP_REQUEST"
}
```

---

## 6. State Machines & Protocol Invariants

### 6.1. Connector Operational State Transition Table

The connector state stored in `connectors.status` obeys the following finite state machine:

| Current State | Triggering Message | New State | Conditions & Invariants |
| :--- | :--- | :--- | :--- |
| `OFFLINE` | `BOOT` or `HEARTBEAT` | `AVAILABLE` | Valid registered `charger_id` received by gateway. |
| `AVAILABLE` | `SESSION_START` | `OCCUPIED` | No other session is currently active. |
| `OCCUPIED` | `SESSION_STOP` | `AVAILABLE` | Stop reason $\ne$ `'FAULT'`. Current power resets to 0. |
| Any State | `STATUS (status="FAULTED")` | `FAULTED` | Safety trip, temperature threshold, or ground fault. |
| Any State | 30s Heartbeat Timeout | `OFFLINE` | No TCP frames received within 3 consecutive heartbeat cycles. |
| `FAULTED` | `STATUS (status="AVAILABLE")` | `AVAILABLE` | Clear error condition. |

```text
       +-------------+
       |   OFFLINE   |
       +-------------+
          |       ^
   BOOT / |       | 30s Heartbeat
HEARTBEAT |       | Timeout
          v       |
       +-------------+  SESSION_START  +-------------+
       |  AVAILABLE  | --------------->|  OCCUPIED   |
       +-------------+ <---------------| (In Session)|
          |       ^     SESSION_STOP   +-------------+
          |       |                           |
          | Fault | Clear                     | Fault
          v       |                           v
       +-------------+                 +-------------+
       |   FAULTED   |<----------------+   FAULTED   |
       +-------------+                 +-------------+
```

### 6.2. Charging Session Lifecycle

The `charging_sessions` table follows a strict forward-only progression:

$$\text{None} \xrightarrow{\text{SESSION\_START}} \text{ACTIVE} \xrightarrow{\text{METER (repeated updates)}} \text{ACTIVE} \xrightarrow{\text{SESSION\_STOP}} \text{COMPLETED} \mid \text{FAULTED}$$

1. **Unique Active Singleton:** At most one session per connector may have status `'ACTIVE'`. Enforced in the database by `uq_charging_sessions_active_connector`.
2. **Terminal States:** Once a session reaches `'COMPLETED'` or `'FAULTED'`, its status cannot revert to `'ACTIVE'`.
3. **Walk-In vs Reservation:**
   * If `booking_id` is present, `bookings.status` transitions from `'CONFIRMED'` to `'IN_PROGRESS'` upon `SESSION_START`, and to `'COMPLETED'` upon `SESSION_STOP`.
   * If `booking_id` is null, the session is tracked purely in `charging_sessions` with no booking link.

---

## 7. Error Handling & Validation Scenarios

Gateways must handle incorrect, corrupt, or adversarial frames gracefully without crashing or dropping connection prematurely.

### 7.1. Malformed JSON Input

When a charger transmits invalid JSON syntax (e.g., missing brackets, truncated string):

**Inbound Wire Data:**
```text
{"type": "HEARTBEAT", "charger_id": "SIM-001" INVALID_JSON... \n
```

**Gateway Response:**
```json
{
  "type": "ACK",
  "charger_id": "UNKNOWN",
  "ts": "2026-10-28T14:00:15Z",
  "ref_type": "UNKNOWN",
  "ok": false,
  "error": "MALFORMED_JSON",
  "message": "Failed to parse line as valid JSON document."
}
```

### 7.2. Missing Envelope Fields

When a message omits `type`, `charger_id`, or `ts`:

**Inbound Wire Data:**
```json
{"charger_id": "SIM-001", "ts": "2026-10-28T14:00:20Z"}
```

**Gateway Response:**
```json
{
  "type": "ACK",
  "charger_id": "SIM-001",
  "ts": "2026-10-28T14:00:20Z",
  "ref_type": "UNKNOWN",
  "ok": false,
  "error": "MISSING_ENVELOPE_FIELD",
  "message": "Field 'type' is required in message envelope."
}
```

### 7.3. Unregistered or Unknown `charger_id`

When a client transmits a `charger_id` that is not configured in `connectors.charger_id`:

**Inbound Wire Data:**
```json
{
  "type": "BOOT",
  "charger_id": "SIM-999-NOT-FOUND",
  "ts": "2026-10-28T14:00:00Z",
  "firmware_version": "v1.0.0",
  "model": "RogueSimulator"
}
```

**Gateway Response:**
```json
{
  "type": "ACK",
  "charger_id": "SIM-999-NOT-FOUND",
  "ts": "2026-10-28T14:00:00Z",
  "ref_type": "BOOT",
  "ok": false,
  "error": "UNKNOWN_CHARGER",
  "message": "charger_id 'SIM-999-NOT-FOUND' does not exist in connectors table."
}
```

### 7.4. Duplicate Active Session Attempt

When a charger attempts `SESSION_START` while an existing session is already in progress on that connector:

**Inbound Wire Data:**
```json
{
  "type": "SESSION_START",
  "charger_id": "SIM-001",
  "ts": "2026-10-28T14:12:00Z",
  "booking_id": null
}
```

**Gateway Response:**
```json
{
  "type": "ACK",
  "charger_id": "SIM-001",
  "ts": "2026-10-28T14:12:00Z",
  "ref_type": "SESSION_START",
  "ok": false,
  "error": "SESSION_ALREADY_ACTIVE",
  "message": "Connector SIM-001 already has an ACTIVE charging session (id=42)."
}
```

### 7.5. Telemetry for Inactive / Non-Existent Session

When a charger transmits `METER` with a `session_id` that does not match an active session:

**Inbound Wire Data:**
```json
{
  "type": "METER",
  "charger_id": "SIM-001",
  "ts": "2026-10-28T14:20:00Z",
  "session_id": 9999,
  "kwh_delivered": 1.25,
  "power_kw": 50.0
}
```

**Gateway Response:**
```json
{
  "type": "ACK",
  "charger_id": "SIM-001",
  "ts": "2026-10-28T14:20:00Z",
  "ref_type": "METER",
  "ok": false,
  "session_id": 9999,
  "error": "SESSION_NOT_FOUND",
  "message": "Session 9999 does not exist or is not currently ACTIVE."
}
```

---

## 8. Complete End-to-End Sequence Walkthroughs

### 8.1. Walkthrough 1: Normal Reserved Charging Flow

1. **Connection & Boot**
   * Charger establishes TCP connection to port `9000`.
   * Charger $\to$ Gateway:
     ```json
     {"type":"BOOT","charger_id":"SIM-001","ts":"2026-10-28T14:00:00Z","firmware_version":"v2.1.0","model":"VoltSim-DC-Fast","vendor":"VoltRelay"}
     ```
   * Gateway $\to$ Charger:
     ```json
     {"type":"ACK","charger_id":"SIM-001","ts":"2026-10-28T14:00:00Z","ref_type":"BOOT","ok":true}
     ```

2. **Heartbeat Stream**
   * (After 10 seconds)
   * Charger $\to$ Gateway:
     ```json
     {"type":"HEARTBEAT","charger_id":"SIM-001","ts":"2026-10-28T14:00:10Z","uptime_seconds":10}
     ```
   * Gateway $\to$ Charger:
     ```json
     {"type":"ACK","charger_id":"SIM-001","ts":"2026-10-28T14:00:10Z","ref_type":"HEARTBEAT","ok":true}
     ```

3. **Session Start (Linked to Reservation #14)**
   * Charger $\to$ Gateway:
     ```json
     {"type":"SESSION_START","charger_id":"SIM-001","ts":"2026-10-28T14:05:00Z","booking_id":14,"user_id":3,"soc":20.0}
     ```
   * Gateway $\to$ Charger:
     ```json
     {"type":"ACK","charger_id":"SIM-001","ts":"2026-10-28T14:05:01Z","ref_type":"SESSION_START","ok":true,"session_id":101}
     ```

4. **Telemetry Stream (Meter)**
   * Charger $\to$ Gateway:
     ```json
     {"type":"METER","charger_id":"SIM-001","ts":"2026-10-28T14:05:10Z","session_id":101,"kwh_delivered":0.35,"power_kw":50.0,"soc":21.0,"temperature_c":29.5}
     ```
   * Gateway $\to$ Charger:
     ```json
     {"type":"ACK","charger_id":"SIM-001","ts":"2026-10-28T14:05:10Z","ref_type":"METER","ok":true,"session_id":101}
     ```

5. **Session Stop (Battery Full)**
   * Charger $\to$ Gateway:
     ```json
     {"type":"SESSION_STOP","charger_id":"SIM-001","ts":"2026-10-28T14:35:00Z","session_id":101,"total_kwh":25.0000,"stop_reason":"FULL_BATTERY","soc_end":100.0}
     ```
   * Gateway $\to$ Charger:
     ```json
     {"type":"ACK","charger_id":"SIM-001","ts":"2026-10-28T14:35:01Z","ref_type":"SESSION_STOP","ok":true,"session_id":101}
     ```

6. **Status Sync Back to Available**
   * Charger $\to$ Gateway:
     ```json
     {"type":"STATUS","charger_id":"SIM-001","ts":"2026-10-28T14:35:02Z","status":"AVAILABLE"}
     ```
   * Gateway $\to$ Charger:
     ```json
     {"type":"ACK","charger_id":"SIM-001","ts":"2026-10-28T14:35:02Z","ref_type":"STATUS","ok":true}
     ```

---

### 8.2. Walkthrough 2: Gateway-Initiated Remote Stop Flow

1. Session `102` is currently active on `SIM-002`.
2. Driver taps **"Stop Charging"** in the VoltRelay web dashboard.
3. Gateway $\to$ Charger:
   ```json
   {"type":"REMOTE_STOP","charger_id":"SIM-002","ts":"2026-10-28T14:20:00Z","session_id":102,"reason":"USER_APP_REQUEST"}
   ```
4. Charger safely ramps down power to 0 kW and unlocks connector.
5. Charger $\to$ Gateway:
   ```json
   {"type":"SESSION_STOP","charger_id":"SIM-002","ts":"2026-10-28T14:20:03Z","session_id":102,"total_kwh":11.2000,"stop_reason":"REMOTE_STOP","soc_end":58.0}
   ```
6. Gateway $\to$ Charger:
   ```json
   {"type":"ACK","charger_id":"SIM-002","ts":"2026-10-28T14:20:04Z","ref_type":"SESSION_STOP","ok":true,"session_id":102}
   ```

---

## 9. Quick Reference Protocol Matrix

| Message Type | Direction | Frequency / Timing | Key Required Fields | Success Response |
| :--- | :--- | :--- | :--- | :--- |
| `BOOT` | Charger $\to$ Gateway | Once on connect | `firmware_version`, `model` | `ACK (ok=true)` |
| `HEARTBEAT` | Charger $\to$ Gateway | Every 10 seconds | Envelope only (`type`, `charger_id`, `ts`) | `ACK (ok=true)` |
| `STATUS` | Charger $\to$ Gateway | On state change | `status` (`AVAILABLE` \| `OCCUPIED` \| `FAULTED`) | `ACK (ok=true)` |
| `SESSION_START` | Charger $\to$ Gateway | On charge start | Envelope + optional `booking_id`, `user_id`, `soc` | `ACK (ok=true, session_id=ID)` |
| `METER` | Charger $\to$ Gateway | Every 5–10s | `session_id`, `kwh_delivered`, `power_kw` | `ACK (ok=true, session_id=ID)` |
| `SESSION_STOP` | Charger $\to$ Gateway | On charge end | `session_id`, `total_kwh`, `stop_reason` | `ACK (ok=true, session_id=ID)` |
| `ACK` | Gateway $\to$ Charger | Per inbound message | `ref_type`, `ok` | *None (terminal response)* |
| `REMOTE_STOP` | Gateway $\to$ Charger | Asynchronous trigger| `session_id` | Charger sends `SESSION_STOP` |

---

## 10. Compliance Checklist for Implementation

Future module components (Part 2 backend, Part 3 simulator, Part 4 live gateway) must satisfy this checklist:

* [ ] Charger simulator maintains a persistent TCP client connecting to `localhost:9000`.
* [ ] All messages sent and received terminate with `\n`.
* [ ] Heartbeat message is emitted every 10 seconds.
* [ ] Gateway marks a connector `OFFLINE` if no packet is observed for 30 consecutive seconds.
* [ ] Database table `charging_sessions` is populated upon `SESSION_START` and updated on `METER` and `SESSION_STOP`.
* [ ] Concurrent `SESSION_START` calls for an already active connector return `ok: false` with error `SESSION_ALREADY_ACTIVE`.
* [ ] All JSON payloads parse without syntax errors against strict JSON parsers.
