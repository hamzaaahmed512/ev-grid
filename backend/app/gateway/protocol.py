"""
VoltRelay — TCP Live Gateway Protocol Specification & Parsing
Complies with docs/protocol.md (Protocol Version 1.0.0).
"""

import json
from datetime import datetime, timezone
from typing import Any, Tuple, Optional


# Protocol constants
PROTOCOL_VERSION = "1.0.0"
MAX_MESSAGE_BYTES = 65536  # 64 KB limit

# Inbound message types
MSG_BOOT = "BOOT"
MSG_HEARTBEAT = "HEARTBEAT"
MSG_STATUS = "STATUS"
MSG_SESSION_START = "SESSION_START"
MSG_METER = "METER"
MSG_SESSION_STOP = "SESSION_STOP"

INBOUND_MESSAGE_TYPES = {
    MSG_BOOT,
    MSG_HEARTBEAT,
    MSG_STATUS,
    MSG_SESSION_START,
    MSG_METER,
    MSG_SESSION_STOP,
}

# Outbound message types
MSG_ACK = "ACK"
MSG_REMOTE_STOP = "REMOTE_STOP"

# Valid connector statuses per protocol
VALID_STATUSES = {"AVAILABLE", "OCCUPIED", "FAULTED"}

# Valid stop reasons per protocol
VALID_STOP_REASONS = {
    "EV_DISCONNECTED",
    "FULL_BATTERY",
    "LOCAL_STOP",
    "REMOTE_STOP",
    "BOOKING_EXPIRED",
    "FAULT",
}

# Standard protocol error codes
ERR_MALFORMED_JSON = "MALFORMED_JSON"
ERR_MISSING_ENVELOPE = "MISSING_ENVELOPE_FIELD"
ERR_UNKNOWN_TYPE = "UNKNOWN_MESSAGE_TYPE"
ERR_INVALID_PAYLOAD = "INVALID_PAYLOAD"
ERR_UNKNOWN_CHARGER = "UNKNOWN_CHARGER"
ERR_SESSION_ALREADY_ACTIVE = "SESSION_ALREADY_ACTIVE"
ERR_SESSION_NOT_FOUND = "SESSION_NOT_FOUND"


def current_iso_utc() -> str:
    """Return the current UTC timestamp formatted as ISO 8601 with a trailing 'Z'."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def build_ack(
    charger_id: str,
    ref_type: str,
    ok: bool,
    session_id: Optional[int] = None,
    error: Optional[str] = None,
    message: Optional[str] = None,
    ts: Optional[str] = None,
) -> str:
    """
    Construct a JSON ACK wire frame string terminated with a newline character.
    """
    payload: dict[str, Any] = {
        "type": MSG_ACK,
        "charger_id": charger_id or "UNKNOWN",
        "ts": ts or current_iso_utc(),
        "ref_type": ref_type or "UNKNOWN",
        "ok": bool(ok),
    }
    if session_id is not None:
        payload["session_id"] = int(session_id)
    if error is not None:
        payload["error"] = str(error)
    if message is not None:
        payload["message"] = str(message)

    return json.dumps(payload, separators=(",", ":")) + "\n"


def build_remote_stop(
    charger_id: str,
    session_id: int,
    reason: str = "USER_APP_REQUEST",
    ts: Optional[str] = None,
) -> str:
    """
    Construct a REMOTE_STOP command JSON wire frame terminated with a newline character.
    """
    payload = {
        "type": MSG_REMOTE_STOP,
        "charger_id": charger_id,
        "ts": ts or current_iso_utc(),
        "session_id": int(session_id),
        "reason": reason,
    }
    return json.dumps(payload, separators=(",", ":")) + "\n"


def parse_and_validate_frame(raw_line: str) -> Tuple[Optional[dict[str, Any]], Optional[str]]:
    """
    Parse a single raw incoming TCP text line and validate message envelope and payload.

    Returns:
        (data_dict, None) on success.
        (None, error_ack_string) on validation error.
    """
    line = raw_line.strip()
    if not line:
        return None, None

    # Check maximum payload length
    if len(raw_line.encode("utf-8")) > MAX_MESSAGE_BYTES:
        err_ack = build_ack(
            charger_id="UNKNOWN",
            ref_type="UNKNOWN",
            ok=False,
            error=ERR_INVALID_PAYLOAD,
            message=f"Payload exceeds maximum message size of {MAX_MESSAGE_BYTES} bytes.",
        )
        return None, err_ack

    # 1. JSON parsing
    try:
        data = json.loads(line)
        if not isinstance(data, dict):
            raise ValueError("Root JSON element must be an object")
    except Exception:
        err_ack = build_ack(
            charger_id="UNKNOWN",
            ref_type="UNKNOWN",
            ok=False,
            error=ERR_MALFORMED_JSON,
            message="Failed to parse line as valid JSON document.",
        )
        return None, err_ack

    # 2. Envelope validation
    msg_type = data.get("type")
    charger_id = data.get("charger_id")
    ts = data.get("ts")

    if not msg_type:
        err_ack = build_ack(
            charger_id=charger_id or "UNKNOWN",
            ref_type="UNKNOWN",
            ok=False,
            error=ERR_MISSING_ENVELOPE,
            message="Field 'type' is required in message envelope.",
        )
        return None, err_ack

    if not charger_id:
        err_ack = build_ack(
            charger_id="UNKNOWN",
            ref_type=str(msg_type),
            ok=False,
            error=ERR_MISSING_ENVELOPE,
            message="Field 'charger_id' is required in message envelope.",
        )
        return None, err_ack

    if not ts:
        err_ack = build_ack(
            charger_id=str(charger_id),
            ref_type=str(msg_type),
            ok=False,
            error=ERR_MISSING_ENVELOPE,
            message="Field 'ts' is required in message envelope.",
        )
        return None, err_ack

    msg_type_str = str(msg_type).upper()
    if msg_type_str not in INBOUND_MESSAGE_TYPES:
        err_ack = build_ack(
            charger_id=str(charger_id),
            ref_type=str(msg_type),
            ok=False,
            error=ERR_UNKNOWN_TYPE,
            message=f"Message type '{msg_type}' is not recognized.",
        )
        return None, err_ack

    # 3. Payload validation per message type
    val_err = _validate_payload(msg_type_str, data)
    if val_err:
        err_ack = build_ack(
            charger_id=str(charger_id),
            ref_type=msg_type_str,
            ok=False,
            error=ERR_INVALID_PAYLOAD,
            message=val_err,
        )
        return None, err_ack

    return data, None


def _validate_payload(msg_type: str, data: dict[str, Any]) -> Optional[str]:
    """Validate type-specific payload requirements. Returns error message or None."""
    if msg_type == MSG_BOOT:
        fw = data.get("firmware_version")
        if not isinstance(fw, str) or not fw.strip():
            return "Field 'firmware_version' is required and must be a non-empty string."
        model = data.get("model")
        if not isinstance(model, str) or not model.strip():
            return "Field 'model' is required and must be a non-empty string."
        max_power = data.get("max_power_kw")
        if max_power is not None and (not isinstance(max_power, (int, float)) or max_power <= 0):
            return "Field 'max_power_kw' must be a positive number if provided."

    elif msg_type == MSG_HEARTBEAT:
        uptime = data.get("uptime_seconds")
        if uptime is not None and (not isinstance(uptime, int) or uptime < 0):
            return "Field 'uptime_seconds' must be a non-negative integer if provided."

    elif msg_type == MSG_STATUS:
        status = data.get("status")
        if status not in VALID_STATUSES:
            return f"Field 'status' must be one of {sorted(VALID_STATUSES)}."

    elif msg_type == MSG_SESSION_START:
        soc = data.get("soc")
        if soc is not None:
            if not isinstance(soc, (int, float)) or not (0.0 <= float(soc) <= 100.0):
                return "Field 'soc' must be a numeric value between 0.0 and 100.0."

    elif msg_type == MSG_METER:
        session_id = data.get("session_id")
        if session_id is None or not isinstance(session_id, int):
            return "Field 'session_id' is required and must be an integer."
        kwh = data.get("kwh_delivered")
        if kwh is None or not isinstance(kwh, (int, float)) or float(kwh) < 0:
            return "Field 'kwh_delivered' is required and must be a non-negative number."
        power = data.get("power_kw")
        if power is None or not isinstance(power, (int, float)) or float(power) < 0:
            return "Field 'power_kw' is required and must be a non-negative number."
        soc = data.get("soc")
        if soc is not None:
            if not isinstance(soc, (int, float)) or not (0.0 <= float(soc) <= 100.0):
                return "Field 'soc' must be a numeric value between 0.0 and 100.0."

    elif msg_type == MSG_SESSION_STOP:
        session_id = data.get("session_id")
        if session_id is None or not isinstance(session_id, int):
            return "Field 'session_id' is required and must be an integer."
        total_kwh = data.get("total_kwh")
        if total_kwh is None or not isinstance(total_kwh, (int, float)) or float(total_kwh) < 0:
            return "Field 'total_kwh' is required and must be a non-negative number."
        stop_reason = data.get("stop_reason")
        if not stop_reason or stop_reason not in VALID_STOP_REASONS:
            return f"Field 'stop_reason' is required and must be one of {sorted(VALID_STOP_REASONS)}."
        soc_end = data.get("soc_end")
        if soc_end is not None:
            if not isinstance(soc_end, (int, float)) or not (0.0 <= float(soc_end) <= 100.0):
                return "Field 'soc_end' must be a numeric value between 0.0 and 100.0."

    return None
