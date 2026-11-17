warning: in the working copy of 'docs/protocol.md', LF will be replaced by CRLF the next time Git touches it
[1mdiff --git a/docs/protocol.md b/docs/protocol.md[m
[1mindex e69de29..808891a 100644[m
[1m--- a/docs/protocol.md[m
[1m+++ b/docs/protocol.md[m
[36m@@ -0,0 +1,773 @@[m
[32m+[m[32m# VoltRelay — TCP Charger Protocol Contract[m
[32m+[m
[32m+[m[32m**Module 5: TCP Charger Simulator + Live Status Gateway (Part 1)**[m
[32m+[m[32m**Protocol Version:** `1.0.0`[m
[32m+[m[32m**Status:** Canonical Interface Specification[m
[32m+[m
[32m+[m[32m---[m
[32m+[m
[32m+[m[32m## 1. Overview & Architectural Scope[m
[32m+[m
[32m+[m[32mThis specification establishes the communication contract between simulated/physical EV charging hardware and the **VoltRelay Live Status Gateway**.[m
[32m+[m
[32m+[m[32m```text[m
[32m+[m[32m+-----------------------+                    +-------------------------+[m
[32m+[m[32m| Simulated Charger /   |                    | VoltRelay TCP Gateway   |[m
[32m+[m[32m| Hardware Client       |                    | (Port 9000)             |[m
[32m+[m[32m+-----------------------+                    +-------------------------+[m
[32m+[m[32m           |                                              |[m
[32m+[m[32m           | ----- Persistent TCP Handshake ------------> |[m
[32m+[m[32m           | ----- BOOT (Firmware & Capabilities) ------> |[m
[32m+[m[32m           | <---- ACK (ok: true) ----------------------- |[m
[32m+[m[32m           |                                              |[m
[32m+[m[32m           | ===== Periodic Liveness (Every 10s) ======== |[m
[32m+[m[32m           | ----- HEARTBEAT ---------------------------> |[m
[32m+[m[32m           | <---- ACK (ok: true) ----------------------- |[m
[32m+[m[32m           |                                              |[m
[32m+[m[32m           | ===== Charging Session Lifecycle =========== |[m
[32m+[m[32m           | ----- STATUS (AVAILABLE -> OCCUPIED) ------> |[m
[32m+[m[32m           | ----- SESSION_START (booking_id?) ---------> |[m
[32m+[m[32m           | <---- ACK (ok: true, session_id: 42) ------- |[m
[32m+[m[32m           |                                              |[m
[32m+[m[32m           | ----- METER (kWh, kW, SoC, Temp) ----------> |[m
[32m+[m[32m           | <---- ACK (ok: true) ----------------------- |[m
[32m+[m[32m           |                                              |[m
[32m+[m[32m           | <==== REMOTE_STOP (Optional server abort) == |[m
[32m+[m[32m           | ----- SESSION_STOP (total_kwh, reason) ----> |[m
[32m+[m[32m           | <---- ACK (ok: true, session_id: 42) ------- |[m
[32m+[m[32m           |                                              |[m
[32m+[m[32m           | ----- STATUS (OCCUPIED -> AVAILABLE) ------> |[m
[32m+[m[32m           |                                              |[m
[32m+[m[32m```[m
[32m+[m
[32m+[m[32m### Scope Demarcation[m
[32m+[m
[32m+[m[32m* **In Scope for Part 1:** The transport rules, wire framing, common envelope, message payload schemas, state transition invariants, and validation examples specified in this document.[m
[32m+[m[32m* **Deferred to Subsequent Parts:** Concrete TCP server implementation (FastAPI / `asyncio`), simulator runtime daemon, WebSocket client broadcasting to the web interface, and session billing calculation engines.[m
[32m+[m
[32m+[m[32m---[m
[32m+[m
[32m+[m[32m## 2. Transport & Framing Rules[m
[32m+[m
[32m+[m[32mAll implementations (both clients and gateways) **MUST** comply with the following low-level rules:[m
[32m+[m
[32m+[m[32m1. **Transport Layer:** Raw persistent TCP (Transmission Control Protocol).[m
[32m+[m[32m2. **Default Port:** `9000` (configurable on the gateway via the `TCP_GATEWAY_PORT` environment variable).[m
[32m+[m[32m3. **Character Encoding:** `UTF-8` strictly.[m
[32m+[m[32m4. **Framing (NDJSON):** Every message **MUST** be serialized as a single, newline-delimited JSON document ending with a newline character (`\n`, ASCII `0x0A`). Gateways **MUST** accept and strip optional carriage returns (`\r\n`).[m
[32m+[m[32m5. **One Message Per Line:** Multiple JSON objects on a single line are strictly forbidden. Empty lines or whitespace-only lines **MUST** be ignored without terminating the connection.[m
[32m+[m[32m6. **Maximum Message Size:** Any single message line exceeding `65,536` bytes (64 KB) will result in immediate connection closure by the gateway to prevent buffer-exhaustion attacks.[m
[32m+[m[32m7. **Connection Persistence:** Connections remain open indefinitely. The charger initiates the TCP socket on boot and maintains the socket across multiple charging sessions.[m
[32m+[m
[32m+[m[32m---[m
[32m+[m
[32m+[m[32m## 3. Common Message Envelope[m
[32m+[m
[32m+[m[32mEvery message sent across the TCP connection—whether from charger to gateway or gateway to charger—**MUST** contain the following three envelope fields at the root of the JSON object:[m
[32m+[m
[32m+[m[32m| Field | Type | Description | Example |[m
[32m+[m[32m| :--- | :--- | :--- | :--- |[m
[32m+[m[32m| `type` | `string` | Uppercase discriminator identifying the message action. | `"BOOT"`, `"HEARTBEAT"`, `"ACK"` |[m
[32m+[m[32m| `charger_id` | `string` | Stable unique identifier assigned to the simulated connector (e.g., from `connectors.charger_id`). | `"SIM-001"` |[m
[32m+[m[32m| `ts` | `string` | ISO 8601 UTC timestamp with second or millisecond precision and a trailing `Z`. | `"2026-10-28T14:30:00Z"` |[m
[32m+[m
[32m+[m[32m### Envelope Example[m
[32m+[m
[32m+[m[32m```json[m
[32m+[m[32m{[m
[32m+[m[32m  "type": "HEARTBEAT",[m
[32m+[m[32m  "charger_id": "SIM-001",[m
[32m+[m[32m  "ts": "2026-10-28T14:30:00Z"[m
[32m+[m[32m}[m
[32m+[m[32m```[m
[32m+[m
[32m+[m[32m---[m
[32m+[m
[32m+[m[32m## 4. Charger-to-Gateway Messages (Inbound)[m
[32m+[m
[32m+[m[32mChargers transmit six primary message types to report lifecycle, health, telemetry, and status changes.[m
[32m+[m
[32m+[m[32m---[m
[32m+[m
[32m+[m[32m### 4.1. `BOOT`[m
[32m+[m
[32m+[m[32mTransmitted immediately when the charger establishes or re-establishes a TCP connection with the gateway.[m
[32m+[m
[32m+[m[32m* **Purpose:** Registers hardware capabilities, firmware version, and announces the charger to the gateway.[m
[32m+[m[32m* **Frequency:** Once upon connection establishment.[m
[32m+[m
[32m+[m[32m#### Field Specifications[m
[32m+[m
[32m+[m[32m| Field | In/Out | Type | Required? | Valid Values / Constraints | Description |[m
[32m+[m[32m| :--- | :--- | :--- | :--- | :--- | :--- |[m
[32m+[m[32m| `firmware_version` | Payload | `string` | **Required** | Non-empty string (e.g. `"v1.2.0"`) | Firmware release identifier. |[m
[32m+[m[32m| `model` | Payload | `string` | **Required** | Non-empty string (e.g. `"VoltBox-50"`) | Hardware model name. |[m
[32m+[m[32m| `vendor` | Payload | `string` | Optional | String | Manufacturer or vendor name. |[m
[32m+[m[32m| `max_power_kw` | Payload | `number` | Optional | Decimal $> 0.0$ | Maximum rated output in kW. |[m
[32m+[m[32m| `connector_types` | Payload | `array[string]` | Optional | e.g. `["CCS2"]`, `["Type 2"]` | Supported connector standards. |[m
[32m+[m
[32m+[m[32m#### JSON Example: `BOOT`[m
[32m+[m
[32m+[m[32m```json[m
[32m+[m[32m{[m
[32m+[m[32m  "type": "BOOT",[m
[32m+[m[32m  "charger_id": "SIM-001",[m
[32m+[m[32m  "ts": "2026-10-28T14:00:00Z",[m
[32m+[m[32m  "firmware_version": "v2.1.0",[m
[32m+[m[32m  "model": "VoltSim-DC-Fast",[m
[32m+[m[32m  "vendor": "VoltRelay Labs",[m
[32m+[m[32m  "max_power_kw": 120.0,[m
[32m+[m[32m  "connector_types": ["CCS2", "CHAdeMO"][m
[32m+[m[32m}[m
[32m+[m[32m```[m
[32m+[m
[32m+[m[32m#### Gateway Action[m
[32m+[m
[32m+[m[32m1. Validates that `charger_id` exists in the `connectors` database table.[m
[32m+[m[32m2. Updates `connectors.last_seen = ts`.[m
[32m+[m[32m3. Returns an `ACK` response (`ref_type: "BOOT"`, `ok: true`).[m
[32m+[m
[32m+[m[32m---[m
[32m+[m
[32m+[m[32m### 4.2. `HEARTBEAT`[m
[32m+[m
[32m+[m[32mPeriodic keep-alive signal transmitted by the charger.[m
[32m+[m
[32m+[m[32m* **Purpose:** Confirms client liveness, socket health, and tracks connectivity.[m
[32m+[m[32m* **Interval:** Sent precisely every **10 seconds** ($\pm 1$s).[m
[32m+[m[32m* **Timeout Invariant:** If the gateway does not receive any message from a charger for **3 consecutive heartbeat intervals (30 seconds)**, the charger is marked `OFFLINE`.[m
[32m+[m
[32m+[m[32m#### Field Specifications[m
[32m+[m
[32m+[m[32m| Field | In/Out | Type | Required? | Valid Values / Constraints | Description |[m
[32m+[m[32m| :--- | :--- | :--- | :--- | :--- | :--- |[m
[32m+[m[32m| `uptime_seconds` | Payload | `integer` | Optional | $\ge 0$ | Total seconds since charger boot. |[m
[32m+[m
[32m+[m[32m#### JSON Example: `HEARTBEAT`[m
[32m+[m
[32m+[m[32m```json[m
[32m+[m[32m{[m
[32m+[m[32m  "type": "HEARTBEAT",[m
[32m+[m[32m  "charger_id": "SIM-001",[m
[32m+[m[32m  "ts": "2026-10-28T14:00:10Z",[m
[32m+[m[32m  "uptime_seconds": 3600[m
[32m+[m[32m}[m
[32m+[m[32m```[m
[32m+[m
[32m+[m[32m#### Gateway Action[m
[32m+[m
[32m+[m[32m1. Updates `connectors.last_seen = ts`.[m
[32m+[m[32m2. Resets the 30-second disconnect watchdog timer.[m
[32m+[m[32m3. Returns an `ACK` response (`ref_type: "HEARTBEAT"`, `ok: true`).[m
[32m+[m
[32m+[m[32m---[m
[32m+[m
[32m+[m[32m### 4.3. `STATUS`[m
[32m+[m
[32m+[m[32mTransmitted whenever the operational readiness of the connector changes, or periodically to sync status.[m
[32m+[m
[32m+[m[32m* **Purpose:** Updates the database and broadcast layer on whether the connector is free, occupied, or faulted.[m
[32m+[m[32m* **Frequency:** Triggered on state transitions, or as part of periodic sync.[m
[32m+[m
[32m+[m[32m#### Field Specifications[m
[32m+[m
[32m+[m[32m| Field | In/Out | Type | Required? | Valid Values / Constraints | Description |[m
[32m+[m[32m| :--- | :--- | :--- | :--- | :--- | :--- |[m
[32m+[m[32m| `status` | Payload | `string` | **Required** | `'AVAILABLE'`, `'OCCUPIED'`, `'FAULTED'` | Connector operational state. |[m
[32m+[m[32m| `error_code` | Payload | `string` | Optional | e.g. `'NO_ERROR'`, `'GROUND_FAULT'`, `'OVER_TEMP'` | Diagnostic code when `FAULTED`. |[m
[32m+[m[32m| `error_description` | Payload | `string` | Optional | Human-readable string | Detailed fault explanation. |[m
[32m+[m
[32m+[m[32m#### JSON Example: `STATUS` (Normal)[m
[32m+[m
[32m+[m[32m```json[m
[32m+[m[32m{[m
[32m+[m[32m  "type": "STATUS",[m
[32m+[m[32m  "charger_id": "SIM-001",[m
[32m+[m[32m  "ts": "2026-10-28T14:05:00Z",[m
[32m+[m[32m  "status": "AVAILABLE"[m
[32m+[m[32m}[m
[32m+[m[32m```[m
[32m+[m
[32m+[m[32m#### JSON Example: `STATUS` (Faulted)[m
[32m+[m
[32m+[m[32m```json[m
[32m+[m[32m{[m
[32m+[m[32m  "type": "STATUS",[m
[32m+[m[32m  "charger_id": "SIM-001",[m
[32m+[m[32m  "ts": "2026-10-28T14:06:12Z",[m
[32m+[m[32m  "status": "FAULTED",[m
[32m+[m[32m  "error_code": "OVER_TEMP",[m
[32m+[m[32m  "error_description": "Connector cable temperature sensor exceeded 85C threshold."[m
[32m+[m[32m}[m
[32m+[m[32m```[m
[32m+[m
[32m+[m[32m#### Gateway Action[m
[32m+[m
[32m+[m[32m1. Updates `connectors.status` to the specified value.[m
[32m+[m[32m2. Updates `connectors.last_seen = ts`.[m
[32m+[m[32m3. If `status` becomes `AVAILABLE` or `FAULTED`, resets `connectors.current_power_kw = 0.00`.[m
[32m+[m[32m4. Returns an `ACK` response (`ref_type: "STATUS"`, `ok: true`).[m
[32m+[m
[32m+[m[32m---[m
[32m+[m
[32m+[m[32m### 4.4. `SESSION_START`[m
[32m+[m
[32m+[m[32mTransmitted when an electric vehicle connects and begins drawing power or is authorized to charge.[m
[32m+[m
[32m+[m[32m* **Purpose:** Creates a record in the `charging_sessions` database table, links optional reservations, and marks the connector as in-use.[m
[32m+[m[32m* **Concurrency Protection:** A connector **MUST NOT** have more than one `ACTIVE` session at a time. The gateway will reject duplicate active session attempts with an error ACK.[m
[32m+[m
[32m+[m[32m#### Field Specifications[m
[32m+[m
[32m+[m[32m| Field | In/Out | Type | Required? | Valid Values / Constraints | Description |[m
[32m+[m[32m| :--- | :--- | :--- | :--- | :--- | :--- |[m
[32m+[m[32m| `booking_id` | Payload | `integer` | Optional | Null or existing `bookings.id` | Reservation ID for booked sessions. Null for walk-in drivers. |[m
[32m+[m[32m| `user_id` | Payload | `integer` | Optional | Null or existing `users.id` | Driver initiating session. |[m
[32m+[m[32m| `soc` | Payload | `number` | Optional | Decimal between $0.0$ and $100.0$ | Initial State of Charge (SoC %). |[m
[32m+[m[32m| `id_tag` | Payload | `string` | Optional | Non-empty alphanumeric string | Driver RFID / app authorization token. |[m
[32m+[m
[32m+[m[32m#### JSON Example: `SESSION_START` (With Reservation)[m
[32m+[m
[32m+[m[32m```json[m
[32m+[m[32m{[m
[32m+[m[32m  "type": "SESSION_START",[m
[32m+[m[32m  "charger_id": "SIM-001",[m
[32m+[m[32m  "ts": "2026-10-28T14:10:00Z",[m
[32m+[m[32m  "booking_id": 14,[m
[32m+[m[32m  "user_id": 3,[m
[32m+[m[32m  "soc": 22.5[m
[32m+[m[32m}[m
[32m+[m[32m```[m
[32m+[m
[32m+[m[32m#### JSON Example: `SESSION_START` (Walk-in Session)[m
[32m+[m
[32m+[m[32m```json[m
[32m+[m[32m{[m
[32m+[m[32m  "type": "SESSION_START",[m
[32m+[m[32m  "charger_id": "SIM-001",[m
[32m+[m[32m  "ts": "2026-10-28T14:10:00Z",[m
[32m+[m[32m  "booking_id": null,[m
[32m+[m[32m  "user_id": null,[m
[32m+[m[32m  "soc": 18.0[m
[32m+[m[32m}[m
[32m+[m[32m```[m
[32m+[m
[32m+[m[32m#### Gateway Action[m
[32m+[m
[32m+[m[32m1. Checks if the connector currently has an `ACTIVE` record in `charging_sessions`.[m
[32m+[m[32m   * If yes: Returns `ACK` with `ok: false`, `error: "SESSION_ALREADY_ACTIVE"`.[m
[32m+[m[32m2. If `booking_id` is supplied:[m
[32m+[m[32m   * Verifies the booking exists and belongs to this connector/station.[m
[32m+[m[32m   * Updates `bookings.status = 'IN_PROGRESS'`.[m
[32m+[m[32m3. Inserts a new record into `charging_sessions` with:[m
[32m+[m[32m   * `connector_id = <resolved_connector_id>`[m
[32m+[m[32m   * `booking_id = booking_id`[m
[32m+[m[32m   * `user_id = user_id`[m
[32m+[m[32m   * `status = 'ACTIVE'`[m
[32m+[m[32m   * `started_at = ts`[m
[32m+[m[32m   * `soc_start = soc`[m
[32m+[m[32m   * `kwh_delivered = 0.0000`[m
[32m+[m[32m   * `peak_power_kw = 0.00`[m
[32m+[m[32m   * `cost = 0.00`[m
[32m+[m[32m4. Updates `connectors.status = 'OCCUPIED'`.[m
[32m+[m[32m5. Returns `ACK` with `ref_type: "SESSION_START"`, `ok: true`, and the newly generated database `session_id`.[m
[32m+[m
[32m+[m[32m---[m
[32m+[m
[32m+[m[32m### 4.5. `METER`[m
[32m+[m
[32m+[m[32mPeriodic telemetry telemetry updates dispatched while a charging session is actively running.[m
[32m+[m
[32m+[m[32m* **Purpose:** Streams instantaneous power, cumulative energy, battery State of Charge, and temperature diagnostics to the gateway.[m
[32m+[m[32m* **Interval:** Every **5 to 10 seconds** throughout the active session.[m
[32m+[m
[32m+[m[32m#### Field Specifications[m
[32m+[m
[32m+[m[32m| Field | In/Out | Type | Required? | Valid Values / Constraints | Description |[m
[32m+[m[32m| :--- | :--- | :--- | :--- | :--- | :--- |[m
[32m+[m[32m| `session_id` | Payload | `integer` | **Required** | Must match the active `charging_sessions.id` | Session identifier assigned during `SESSION_START`. |[m
[32m+[m[32m| `kwh_delivered` | Payload | `number` | **Required** | Decimal $\ge 0.0$ | Cumulative energy delivered during this session (in kWh). |[m
[32m+[m[32m| `power_kw` | Payload | `number` | **Required** | Decimal $\ge 0.0$ | Current instantaneous charging power in kW. |[m
[32m+[m[32m| `soc` | Payload | `number` | Optional | Decimal between $0.0$ and $100.0$ | Current vehicle battery State of Charge (%). |[m
[32m+[m[32m| `temperature_c` | Payload | `number` | Optional | Decimal (e.g. $-20.0$ to $120.0$) | Internal connector/cable temperature in Celsius. |[m
[32m+[m[32m| `voltage_v` | Payload | `number` | Optional | Decimal $\ge 0.0$ | Line voltage in Volts (e.g., $398.5$). |[m
[32m+[m[32m| `current_a` | Payload | `number` | Optional | Decimal $\ge 0.0$ | Charging current in Amperes (e.g., $112.4$). |[m
[32m+[m
[32m+[m[32m#### JSON Example: `METER`[m
[32m+[m
[32m+[m[32m```json[m
[32m+[m[32m{[m
[32m+[m[32m  "type": "METER",[m
[32m+[m[32m  "charger_id": "SIM-001",[m
[32m+[m[32m  "ts": "2026-10-28T14:15:30Z",[m
[32m+[m[32m  "session_id": 42,[m
[32m+[m[32m  "kwh_delivered": 12.4500,[m
[32m+[m[32m  "power_kw": 48.60,[m
[32m+[m[32m  "soc": 45.2,[m
[32m+[m[32m  "temperature_c": 36.8[m
[32m+[m[32m}[m
[32m+[m[32m```[m
[32m+[m
[32m+[m[32m#### Gateway Action[m
[32m+[m
[32m+[m[32m1. Validates that `session_id` exists and has `status = 'ACTIVE'`.[m
[32m+[m[32m2. Updates `charging_sessions` for `session_id`:[m
[32m+[m[32m   * `kwh_delivered = kwh_delivered`[m
[32m+[m[32m   * `peak_power_kw = GREATEST(peak_power_kw, power_kw)`[m
[32m+[m[32m   * `soc_end = soc`[m
[32m+[m[32m   * Computes updated `cost = kwh_delivered * connector.price_per_kwh`.[m
[32m+[m[32m3. Updates `connectors`:[m
[32m+[m[32m   * `current_power_kw = power_kw`[m
[32m+[m[32m   * `last_seen = ts`[m
[32m+[m[32m4. Returns `ACK` with `ref_type: "METER"`, `ok: true`, `session_id: 42`.[m
[32m+[m
[32m+[m[32m---[m
[32m+[m
[32m+[m[32m### 4.6. `SESSION_STOP`[m
[32m+[m
[32m+[m[32mTransmitted when a charging session terminates due to normal completion, user unplugging, fault, or remote command.[m
[32m+[m
[32m+[m[32m* **Purpose:** Finalizes the `charging_sessions` record, records the total delivered energy, settles session cost, and frees the connector.[m
[32m+[m
[32m+[m[32m#### Field Specifications[m
[32m+[m
[32m+[m[32m| Field | In/Out | Type | Required? | Valid Values / Constraints | Description |[m
[32m+[m[32m| :--- | :--- | :--- | :--- | :--- | :--- |[m
[32m+[m[32m| `session_id` | Payload | `integer` | **Required** | Must match target `charging_sessions.id` | Session identifier being stopped. |[m
[32m+[m[32m| `total_kwh` | Payload | `number` | **Required** | Decimal $\ge 0.0$ | Final cumulative energy delivered in kWh. |[m
[32m+[m[32m| `stop_reason` | Payload | `string` | **Required** | See allowed stop reasons below | Reason charging was halted. |[m
[32m+[m[32m| `soc_end` | Payload | `number` | Optional | Decimal between $0.0$ and $100.0$ | Final State of Charge (%) at unplug. |[m
[32m+[m
[32m+[m[32m#### Permitted `stop_reason` Values[m
[32m+[m
[32m+[m[32m* `"EV_DISCONNECTED"` — Physical vehicle unplugged or charging port unlatched.[m
[32m+[m[32m* `"FULL_BATTERY"` — Vehicle BMS signaled battery capacity reached 100% or user target.[m
[32m+[m[32m* `"LOCAL_STOP"` — Driver pressed the stop button on the physical charger / touchscreen.[m
[32m+[m[32m* `"REMOTE_STOP"` — Stopped by gateway command (e.g. mobile app cancellation).[m
[32m+[m[32m* `"BOOKING_EXPIRED"` — Reservation slot time window elapsed.[m
[32m+[m[32m* `"FAULT"` — Session aborted due to an emergency condition or hardware error.[m
[32m+[m
[32m+[m[32m#### JSON Example: `SESSION_STOP`[m
[32m+[m
[32m+[m[32m```json[m
[32m+[m[32m{[m
[32m+[m[32m  "type": "SESSION_STOP",[m
[32m+[m[32m  "charger_id": "SIM-001",[m
[32m+[m[32m  "ts": "2026-10-28T14:45:00Z",[m
[32m+[m[32m  "session_id": 42,[m
[32m+[m[32m  "total_kwh": 34.2500,[m
[32m+[m[32m  "stop_reason": "FULL_BATTERY",[m
[32m+[m[32m  "soc_end": 100.0[m
[32m+[m[32m}[m
[32m+[m[32m```[m
[32m+[m
[32m+[m[32m#### Gateway Action[m
[32m+[m
[32m+[m[32m1. Validates that `session_id` exists and is currently `'ACTIVE'`.[m
[32m+[m[32m2. Updates `charging_sessions`:[m
[32m+[m[32m   * `status = ('FAULTED' if stop_reason == 'FAULT' else 'COMPLETED')`[m
[32m+[m[32m   * `ended_at = ts`[m
[32m+[m[32m   * `kwh_delivered = total_kwh`[m
[32m+[m[32m   * `soc_end = soc_end`[m
[32m+[m[32m   * `stop_reason = stop_reason`[m
[32m+[m[32m   * Computes final `cost = total_kwh * connector.price_per_kwh`.[m
[32m+[m[32m3. If session had an associated `booking_id`:[m
[32m+[m[32m   * Updates `bookings.status = 'COMPLETED'`.[m
[32m+[m[32m4. Updates `connectors`:[m
[32m+[m[32m   * `status = 'AVAILABLE'` (or `'FAULTED'` if stop_reason was `'FAULT'`)[m
[32m+[m[32m   * `current_power_kw = 0.00`[m
[32m+[m[32m   * `last_seen = ts`[m
[32m+[m[32m5. Returns `ACK` with `ref_type: "SESSION_STOP"`, `ok: true`, `session_id: 42`.[m
[32m+[m
[32m+[m[32m---[m
[32m+[m
[32m+[m[32m## 5. Gateway-to-Charger Messages (Outbound)[m
[32m+[m
[32m+[m[32mThe gateway communicates back to chargers over the same persistent TCP socket.[m
[32m+[m
[32m+[m[32m---[m
[32m+[m
[32m+[m[32m### 5.1. `ACK`[m
[32m+[m
[32m+[m[32mStandard transactional acknowledgement returned by the gateway for every inbound charger message.[m
[32m+[m
[32m+[m[32m* **Purpose:** Informs the charger whether its transmission was accepted and stored, and provides server-generated IDs (such as `session_id`).[m
[32m+[m[32m* **Delivery:** Synchronous response to each inbound message.[m
[32m+[m
[32m+[m[32m#### Field Specifications[m
[32m+[m
[32m+[m[32m| Field | In/Out | Type | Required? | Valid Values / Constraints | Description |[m
[32m+[m[32m| :--- | :--- | :--- | :--- | :--- | :--- |[m
[32m+[m[32m| `ref_type` | Payload | `string` | **Required** | The inbound message `type` being acknowledged | Mirrors inbound type (e.g. `"BOOT"`, `"SESSION_START"`). |[m
[32m+[m[32m| `ok` | Payload | `boolean` | **Required** | `true` or `false` | Success status indicator. |[m
[32m+[m[32m| `session_id` | Payload | `integer` | Optional | Integer | Returned on `SESSION_START`, `METER`, `SESSION_STOP`. |[m
[32m+[m[32m| `error` | Payload | `string` | Optional | e.g. `'UNKNOWN_CHARGER'`, `'SESSION_ALREADY_ACTIVE'` | Standardized error code if `ok: false`. |[m
[32m+[m[32m| `message` | Payload | `string` | Optional | Human-readable explanation | Diagnostic text if `ok: false`. |[m
[32m+[m
[32m+[m[32m#### JSON Example: Successful `SESSION_START` ACK[m
[32m+[m
[32m+[m[32m```json[m
[32m+[m[32m{[m
[32m+[m[32m  "type": "ACK",[m
[32m+[m[32m  "charger_id": "SIM-001",[m
[32m+[m[32m  "ts": "2026-10-28T14:10:01Z",[m
[32m+[m[32m  "ref_type": "SESSION_START",[m
[32m+[m[32m  "ok": true,[m
[32m+[m[32m  "session_id": 42[m
[32m+[m[32m}[m
[32m+[m[32m```[m
[32m+[m
[32m+[m[32m#### JSON Example: Successful `HEARTBEAT` ACK[m
[32m+[m
[32m+[m[32m```json[m
[32m+[m[32m{[m
[32m+[m[32m  "type": "ACK",[m
[32m+[m[32m  "charger_id": "SIM-001",[m
[32m+[m[32m  "ts": "2026-10-28T14:00:10Z",[m
[32m+[m[32m  "ref_type": "HEARTBEAT",[m
[32m+[m[32m  "ok": true[m
[32m+[m[32m}[m
[32m+[m[32m```[m
[32m+[m
[32m+[m[32m#### JSON Example: Error ACK (Duplicate Active Session)[m
[32m+[m
[32m+[m[32m```json[m
[32m+[m[32m{[m
[32m+[m[32m  "type": "ACK",[m
[32m+[m[32m  "charger_id": "SIM-001",[m
[32m+[m[32m  "ts": "2026-10-28T14:10:05Z",[m
[32m+[m[32m  "ref_type": "SESSION_START",[m
[32m+[m[32m  "ok": false,[m
[32m+[m[32m  "error": "SESSION_ALREADY_ACTIVE",[m
[32m+[m[32m  "message": "Connector SIM-001 already has active session 42. Terminate existing session first."[m
[32m+[m[32m}[m
[32m+[m[32m```[m
[32m+[m
[32m+[m[32m---[m
[32m+[m
[32m+[m[32m### 5.2. `REMOTE_STOP`[m
[32m+[m
[32m+[m[32mAsynchronous command sent from gateway to charger to abort an ongoing charging session.[m
[32m+[m
[32m+[m[32m* **Purpose:** Triggered by user app action, host override, admin intervention, or emergency shutdown.[m
[32m+[m[32m* **Charger Response:** Upon receiving this message, the charger **MUST** safely ramp down current, unlock the latch, and send a `SESSION_STOP` message with `stop_reason: "REMOTE_STOP"`.[m
[32m+[m
[32m+[m[32m#### Field Specifications[m
[32m+[m
[32m+[m[32m| Field | In/Out | Type | Required? | Valid Values / Constraints | Description |[m
[32m+[m[32m| :--- | :--- | :--- | :--- | :--- | :--- |[m
[32m+[m[32m| `session_id` | Payload | `integer` | **Required** | Must match active session ID | Target session to abort. |[m
[32m+[m[32m| `reason` | Payload | `string` | Optional | e.g. `'USER_APP_REQUEST'`, `'ADMIN_SHUTDOWN'` | Contextual reason for termination. |[m
[32m+[m
[32m+[m[32m#### JSON Example: `REMOTE_STOP`[m
[32m+[m
[32m+[m[32m```json[m
[32m+[m[32m{[m
[32m+[m[32m  "type": "REMOTE_STOP",[m
[32m+[m[32m  "charger_id": "SIM-001",[m
[32m+[m[32m  "ts": "2026-10-28T14:35:00Z",[m
[32m+[m[32m  "session_id": 42,[m
[32m+[m[32m  "reason": "USER_APP_REQUEST"[m
[32m+[m[32m}[m
[32m+[m[32m```[m
[32m+[m
[32m+[m[32m---[m
[32m+[m
[32m+[m[32m## 6. State Machines & Protocol Invariants[m
[32m+[m
[32m+[m[32m### 6.1. Connector Operational State Transition Table[m
[32m+[m
[32m+[m[32mThe connector state stored in `connectors.status` obeys the following finite state machine:[m
[32m+[m
[32m+[m[32m| Current State | Triggering Message | New State | Conditions & Invariants |[m
[32m+[m[32m| :--- | :--- | :--- | :--- |[m
[32m+[m[32m| `OFFLINE` | `BOOT` or `HEARTBEAT` | `AVAILABLE` | Valid registered `charger_id` received by gateway. |[m
[32m+[m[32m| `AVAILABLE` | `SESSION_START` | `OCCUPIED` | No other session is currently active. |[m
[32m+[m[32m| `OCCUPIED` | `SESSION_STOP` | `AVAILABLE` | Stop reason $\ne$ `'FAULT'`. Current power resets to 0. |[m
[32m+[m[32m| Any State | `STATUS (status="FAULTED")` | `FAULTED` | Safety trip, temperature threshold, or ground fault. |[m
[32m+[m[32m| Any State | 30s Heartbeat Timeout | `OFFLINE` | No TCP frames received within 3 consecutive heartbeat cycles. |[m
[32m+[m[32m| `FAULTED` | `STATUS (status="AVAILABLE")` | `AVAILABLE` | Clear error condition. |[m
[32m+[m
[32m+[m[32m```text[m
[32m+[m[32m       +-------------+[m
[32m+[m[32m       |   OFFLINE   |[m
[32m+[m[32m       +-------------+[m
[32m+[m[32m          |       ^[m
[32m+[m[32m   BOOT / |       | 30s Heartbeat[m
[32m+[m[32mHEARTBEAT |       | Timeout[m
[32m+[m[32m          v       |[m
[32m+[m[32m       +-------------+  SESSION_START  +-------------+[m
[32m+[m[32m       |  AVAILABLE  | --------------->|  OCCUPIED   |[m
[32m+[m[32m       +-------------+ <---------------| (In Session)|[m
[32m+[m[32m          |       ^     SESSION_STOP   +-------------+[m
[32m+[m[32m          |       |                           |[m
[32m+[m[32m          | Fault | Clear                     | Fault[m
[32m+[m[32m          v       |                           v[m
[32m+[m[32m       +-------------+                 +-------------+[m
[32m+[m[32m       |   FAULTED   |<----------------+   FAULTED   |[m
[32m+[m[32m       +-------------+                 +-------------+[m
[32m+[m[32m```[m
[32m+[m
[32m+[m[32m### 6.2. Charging Session Lifecycle[m
[32m+[m
[32m+[m[32mThe `charging_sessions` table follows a strict forward-only progression:[m
[32m+[m
[32m+[m[32m$$\text{None} \xrightarrow{\text{SESSION\_START}} \text{ACTIVE} \xrightarrow{\text{METER (repeated updates)}} \text{ACTIVE} \xrightarrow{\text{SESSION\_STOP}} \text{COMPLETED} \mid \text{FAULTED}$$[m
[32m+[m
[32m+[m[32m1. **Unique Active Singleton:** At most one session per connector may have status `'ACTIVE'`. Enforced in the database by `uq_charging_sessions_active_connector`.[m
[32m+[m[32m2. **Terminal States:** Once a session reaches `'COMPLETED'` or `'FAULTED'`, its status cannot revert to `'ACTIVE'`.[m
[32m+[m[32m3. **Walk-In vs Reservation:**[m
[32m+[m[32m   * If `booking_id` is present, `bookings.status` transitions from `'CONFIRMED'` to `'IN_PROGRESS'` upon `SESSION_START`, and to `'COMPLETED'` upon `SESSION_STOP`.[m
[32m+[m[32m   * If `booking_id` is null, the session is tracked purely in `charging_sessions` with no booking link.[m
[32m+[m
[32m+[m[32m---[m
[32m+[m
[32m+[m[32m## 7. Error Handling & Validation Scenarios[m
[32m+[m
[32m+[m[32mGateways must handle incorrect, corrupt, or adversarial frames gracefully without crashing or dropping connection prematurely.[m
[32m+[m
[32m+[m[32m### 7.1. Malformed JSON Input[m
[32m+[m
[32m+[m[32mWhen a charger transmits invalid JSON syntax (e.g., missing brackets, truncated string):[m
[32m+[m
[32m+[m[32m**Inbound Wire Data:**[m
[32m+[m[32m```text[m
[32m+[m[32m{"type": "HEARTBEAT", "charger_id": "SIM-001" INVALID_JSON... \n[m
[32m+[m[32m```[m
[32m+[m
[32m+[m[32m**Gateway Response:**[m
[32m+[m[32m```json[m
[32m+[m[32m{[m
[32m+[m[32m  "type": "ACK",[m
[32m+[m[32m  "charger_id": "UNKNOWN",[m
[32m+[m[32m  "ts": "2026-10-28T14:00:15Z",[m
[32m+[m[32m  "ref_type": "UNKNOWN",[m
[32m+[m[32m  "ok": false,[m
[32m+[m[32m  "error": "MALFORMED_JSON",[m
[32m+[m[32m  "message": "Failed to parse line as valid JSON document."[m
[32m+[m[32m}[m
[32m+[m[32m```[m
[32m+[m
[32m+[m[32m### 7.2. Missing Envelope Fields[m
[32m+[m
[32m+[m[32mWhen a message omits `type`, `charger_id`, or `ts`:[m
[32m+[m
[32m+[m[32m**Inbound Wire Data:**[m
[32m+[m[32m```json[m
[32m+[m[32m{"charger_id": "SIM-001", "ts": "2026-10-28T14:00:20Z"}[m
[32m+[m[32m```[m
[32m+[m
[32m+[m[32m**Gateway Response:**[m
[32m+[m[32m```json[m
[32m+[m[32m{[m
[32m+[m[32m  "type": "ACK",[m
[32m+[m[32m  "charger_id": "SIM-001",[m
[32m+[m[32m  "ts": "2026-10-28T14:00:20Z",[m
[32m+[m[32m  "ref_type": "UNKNOWN",[m
[32m+[m[32m  "ok": false,[m
[32m+[m[32m  "error": "MISSING_ENVELOPE_FIELD",[m
[32m+[m[32m  "message": "Field 'type' is required in message envelope."[m
[32m+[m[32m}[m
[32m+[m[32m```[m
[32m+[m
[32m+[m[32m### 7.3. Unregistered or Unknown `charger_id`[m
[32m+[m
[32m+[m[32mWhen a client transmits a `charger_id` that is not configured in `connectors.charger_id`:[m
[32m+[m
[32m+[m[32m**Inbound Wire Data:**[m
[32m+[m[32m```json[m
[32m+[m[32m{[m
[32m+[m[32m  "type": "BOOT",[m
[32m+[m[32m  "charger_id": "SIM-999-NOT-FOUND",[m
[32m+[m[32m  "ts": "2026-10-28T14:00:00Z",[m
[32m+[m[32m  "firmware_version": "v1.0.0",[m
[32m+[m[32m  "model": "RogueSimulator"[m
[32m+[m[32m}[m
[32m+[m[32m```[m
[32m+[m
[32m+[m[32m**Gateway Response:**[m
[32m+[m[32m```json[m
[32m+[m[32m{[m
[32m+[m[32m  "type": "ACK",[m
[32m+[m[32m  "charger_id": "SIM-999-NOT-FOUND",[m
[32m+[m[32m  "ts": "2026-10-28T14:00:00Z",[m
[32m+[m[32m  "ref_type": "BOOT",[m
[32m+[m[32m  "ok": false,[m
[32m+[m[32m  "error": "UNKNOWN_CHARGER",[m
[32m+[m[32m  "message": "charger_id 'SIM-999-NOT-FOUND' does not exist in connectors table."[m
[32m+[m[32m}[m
[32m+[m[32m```[m
[32m+[m
[32m+[m[32m### 7.4. Duplicate Active Session Attempt[m
[32m+[m
[32m+[m[32mWhen a charger attempts `SESSION_START` while an existing session is already in progress on that connector:[m
[32m+[m
[32m+[m[32m**Inbound Wire Data:**[m
[32m+[m[32m```json[m
[32m+[m[32m{[m
[32m+[m[32m  "type": "SESSION_START",[m
[32m+[m[32m  "charger_id": "SIM-001",[m
[32m+[m[32m  "ts": "2026-10-28T14:12:00Z",[m
[32m+[m[32m  "booking_id": null[m
[32m+[m[32m}[m
[32m+[m[32m```[m
[32m+[m
[32m+[m[32m**Gateway Response:**[m
[32m+[m[32m```json[m
[32m+[m[32m{[m
[32m+[m[32m  "type": "ACK",[m
[32m+[m[32m  "charger_id": "SIM-001",[m
[32m+[m[32m  "ts": "2026-10-28T14:12:00Z",[m
[32m+[m[32m  "ref_type": "SESSION_START",[m
[32m+[m[32m  "ok": false,[m
[32m+[m[32m  "error": "SESSION_ALREADY_ACTIVE",[m
[32m+[m[32m  "message": "Connector SIM-001 already has an ACTIVE charging session (id=42)."[m
[32m+[m[32m}[m
[32m+[m[32m```[m
[32m+[m
[32m+[m[32m### 7.5. Telemetry for Inactive / Non-Existent Session[m
[32m+[m
[32m+[m[32mWhen a charger transmits `METER` with a `session_id` that does not match an active session:[m
[32m+[m
[32m+[m[32m**Inbound Wire Data:**[m
[32m+[m[32m```json[m
[32m+[m[32m{[m
[32m+[m[32m  "type": "METER",[m
[32m+[m[32m  "charger_id": "SIM-001",[m
[32m+[m[32m  "ts": "2026-10-28T14:20:00Z",[m
[32m+[m[32m  "session_id": 9999,[m
[32m+[m[32m  "kwh_delivered": 1.25,[m
[32m+[m[32m  "power_kw": 50.0[m
[32m+[m[32m}[m
[32m+[m[32m```[m
[32m+[m
[32m+[m[32m**Gateway Response:**[m
[32m+[m[32m```json[m
[32m+[m[32m{[m
[32m+[m[32m  "type": "ACK",[m
[32m+[m[32m  "charger_id": "SIM-001",[m
[32m+[m[32m  "ts": "2026-10-28T14:20:00Z",[m
[32m+[m[32m  "ref_type": "METER",[m
[32m+[m[32m  "ok": false,[m
[32m+[m[32m  "session_id": 9999,[m
[32m+[m[32m  "error": "SESSION_NOT_FOUND",[m
[32m+[m[32m  "message": "Session 9999 does not exist or is not currently ACTIVE."[m
[32m+[m[32m}[m
[32m+[m[32m```[m
[32m+[m
[32m+[m[32m---[m
[32m+[m
[32m+[m[32m## 8. Complete End-to-End Sequence Walkthroughs[m
[32m+[m
[32m+[m[32m### 8.1. Walkthrough 1: Normal Reserved Charging Flow[m
[32m+[m
[32m+[m[32m1. **Connection & Boot**[m
[32m+[m[32m   * Charger establishes TCP connection to port `9000`.[m
[32m+[m[32m   * Charger $\to$ Gateway:[m
[32m+[m[32m     ```json[m
[32m+[m[32m     {"type":"BOOT","charger_id":"SIM-001","ts":"2026-10-28T14:00:00Z","firmware_version":"v2.1.0","model":"VoltSim-DC-Fast","vendor":"VoltRelay"}[m
[32m+[m[32m     ```[m
[32m+[m[32m   * Gateway $\to$ Charger:[m
[32m+[m[32m     ```json[m
[32m+[m[32m     {"type":"ACK","charger_id":"SIM-001","ts":"2026-10-28T14:00:00Z","ref_type":"BOOT","ok":true}[m
[32m+[m[32m     ```[m
[32m+[m
[32m+[m[32m2. **Heartbeat Stream**[m
[32m+[m[32m   * (After 10 seconds)[m
[32m+[m[32m   * Charger $\to$ Gateway:[m
[32m+[m[32m     ```json[m
[32m+[m[32m     {"type":"HEARTBEAT","charger_id":"SIM-001","ts":"2026-10-28T14:00:10Z","uptime_seconds":10}[m
[32m+[m[32m     ```[m
[32m+[m[32m   * Gateway $\to$ Charger:[m
[32m+[m[32m     ```json[m
[32m+[m[32m     {"type":"ACK","charger_id":"SIM-001","ts":"2026-10-28T14:00:10Z","ref_type":"HEARTBEAT","ok":true}[m
[32m+[m[32m     ```[m
[32m+[m
[32m+[m[32m3. **Session Start (Linked to Reservation #14)**[m
[32m+[m[32m   * Charger $\to$ Gateway:[m
[32m+[m[32m     ```json[m
[32m+[m[32m     {"type":"SESSION_START","charger_id":"SIM-001","ts":"2026-10-28T14:05:00Z","booking_id":14,"user_id":3,"soc":20.0}[m
[32m+[m[32m     ```[m
[32m+[m[32m   * Gateway $\to$ Charger:[m
[32m+[m[32m     ```json[m
[32m+[m[32m     {"type":"ACK","charger_id":"SIM-001","ts":"2026-10-28T14:05:01Z","ref_type":"SESSION_START","ok":true,"session_id":101}[m
[32m+[m[32m     ```[m
[32m+[m
[32m+[m[32m4. **Telemetry Stream (Meter)**[m
[32m+[m[32m   * Charger $\to$ Gateway:[m
[32m+[m[32m     ```json[m
[32m+[m[32m     {"type":"METER","charger_id":"SIM-001","ts":"2026-10-28T14:05:10Z","session_id":101,"kwh_delivered":0.35,"power_kw":50.0,"soc":21.0,"temperature_c":29.5}[m
[32m+[m[32m     ```[m
[32m+[m[32m   * Gateway $\to$ Charger:[m
[32m+[m[32m     ```json[m
[32m+[m[32m     {"type":"ACK","charger_id":"SIM-001","ts":"2026-10-28T14:05:10Z","ref_type":"METER","ok":true,"session_id":101}[m
[32m+[m[32m     ```[m
[32m+[m
[32m+[m[32m5. **Session Stop (Battery Full)**[m
[32m+[m[32m   * Charger $\to$ Gateway:[m
[32m+[m[32m     ```json[m
[32m+[m[32m     {"type":"SESSION_STOP","charger_id":"SIM-001","ts":"2026-10-28T14:35:00Z","session_id":101,"total_kwh":25.0000,"stop_reason":"FULL_BATTERY","soc_end":100.0}[m
[32m+[m[32m     ```[m
[32m+[m[32m   * Gateway $\to$ Charger:[m
[32m+[m[32m     ```json[m
[32m+[m[32m     {"type":"ACK","charger_id":"SIM-001","ts":"2026-10-28T14:35:01Z","ref_type":"SESSION_STOP","ok":true,"session_id":101}[m
[32m+[m[32m     ```[m
[32m+[m
[32m+[m[32m6. **Status Sync Back to Available**[m
[32m+[m[32m   * Charger $\to$ Gateway:[m
[32m+[m[32m     ```json[m
[32m+[m[32m     {"type":"STATUS","charger_id":"SIM-001","ts":"2026-10-28T14:35:02Z","status":"AVAILABLE"}[m
[32m+[m[32m     ```[m
[32m+[m[32m   * Gateway $\to$ Charger:[m
[32m+[m[32m     ```json[m
[32m+[m[32m     {"type":"ACK","charger_id":"SIM-001","ts":"2026-10-28T14:35:02Z","ref_type":"STATUS","ok":true}[m
[32m+[m[32m     ```[m
[32m+[m
[32m+[m[32m---[m
[32m+[m
[32m+[m[32m### 8.2. Walkthrough 2: Gateway-Initiated Remote Stop Flow[m
[32m+[m
[32m+[m[32m1. Session `102` is currently active on `SIM-002`.[m
[32m+[m[32m2. Driver taps **"Stop Charging"** in the VoltRelay web dashboard.[m
[32m+[m[32m3. Gateway $\to$ Charger:[m
[32m+[m[32m   ```json[m
[32m+[m[32m   {"type":"REMOTE_STOP","charger_id":"SIM-002","ts":"2026-10-28T14:20:00Z","session_id":102,"reason":"USER_APP_REQUEST"}[m
[32m+[m[32m   ```[m
[32m+[m[32m4. Charger safely ramps down power to 0 kW and unlocks connector.[m
[32m+[m[32m5. Charger $\to$ Gateway:[m
[32m+[m[32m   ```json[m
[32m+[m[32m   {"type":"SESSION_STOP","charger_id":"SIM-002","ts":"2026-10-28T14:20:03Z","session_id":102,"total_kwh":11.2000,"stop_reason":"REMOTE_STOP","soc_end":58.0}[m
[32m+[m[32m   ```[m
[32m+[m[32m6. Gateway $\to$ Charger:[m
[32m+[m[32m   ```json[m
[32m+[m[32m   {"type":"ACK","charger_id":"SIM-002","ts":"2026-10-28T14:20:04Z","ref_type":"SESSION_STOP","ok":true,"session_id":102}[m
[32m+[m[32m   ```[m
[32m+[m
[32m+[m[32m---[m
[32m+[m
[32m+[m[32m## 9. Quick Reference Protocol Matrix[m
[32m+[m
[32m+[m[32m| Message Type | Direction | Frequency / Timing | Key Required Fields | Success Response |[m
[32m+[m[32m| :--- | :--- | :--- | :--- | :--- |[m
[32m+[m[32m| `BOOT` | Charger $\to$ Gateway | Once on connect | `firmware_version`, `model` | `ACK (ok=true)` |[m
[32m+[m[32m| `HEARTBEAT` | Charger $\to$ Gateway | Every 10 seconds | Envelope only (`type`, `charger_id`, `ts`) | `ACK (ok=true)` |[m
[32m+[m[32m| `STATUS` | Charger $\to$ Gateway | On state change | `status` (`AVAILABLE` \| `OCCUPIED` \| `FAULTED`) | `ACK (ok=true)` |[m
[32m+[m[32m| `SESSION_START` | Charger $\to$ Gateway | On charge start | Envelope + optional `booking_id`, `user_id`, `soc` | `ACK (ok=true, session_id=ID)` |[m
[32m+[m[32m| `METER` | Charger $\to$ Gateway | Every 5–10s | `session_id`, `kwh_delivered`, `power_kw` | `ACK (ok=true, session_id=ID)` |[m
[32m+[m[32m| `SESSION_STOP` | Charger $\to$ Gateway | On charge end | `session_id`, `total_kwh`, `stop_reason` | `ACK (ok=true, session_id=ID)` |[m
[32m+[m[32m| `ACK` | Gateway $\to$ Charger | Per inbound message | `ref_type`, `ok` | *None (terminal response)* |[m
[32m+[m[32m| `REMOTE_STOP` | Gateway $\to$ Charger | Asynchronous trigger| `session_id` | Charger sends `SESSION_STOP` |[m
[32m+[m
[32m+[m[32m---[m
[32m+[m
[32m+[m[32m## 10. Compliance Checklist for Implementation[m
[32m+[m
[32m+[m[32mFuture module components (Part 2 backend, Part 3 simulator, Part 4 live gateway) must satisfy this checklist:[m
[32m+[m
[32m+[m[32m* [ ] Charger simulator maintains a persistent TCP client connecting to `localhost:9000`.[m
[32m+[m[32m* [ ] All messages sent and received terminate with `\n`.[m
[32m+[m[32m* [ ] Heartbeat message is emitted every 10 seconds.[m
[32m+[m[32m* [ ] Gateway marks a connector `OFFLINE` if no packet is observed for 30 consecutive seconds.[m
[32m+[m[32m* [ ] Database table `charging_sessions` is populated upon `SESSION_START` and updated on `METER` and `SESSION_STOP`.[m
[32m+[m[32m* [ ] Concurrent `SESSION_START` calls for an already active connector return `ok: false` with error `SESSION_ALREADY_ACTIVE`.[m
[32m+[m[32m* [ ] All JSON payloads parse without syntax errors against strict JSON parsers.[m
