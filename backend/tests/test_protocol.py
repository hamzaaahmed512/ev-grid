"""
VoltRelay — Protocol Unit Tests
Tests protocol framing, parsing, envelope validation, and payload validation according to docs/protocol.md.
"""

import json
import unittest

from app.gateway.protocol import (
    parse_and_validate_frame,
    build_ack,
    build_remote_stop,
    MAX_MESSAGE_BYTES,
    ERR_MALFORMED_JSON,
    ERR_MISSING_ENVELOPE,
    ERR_UNKNOWN_TYPE,
    ERR_INVALID_PAYLOAD,
    MSG_BOOT,
    MSG_HEARTBEAT,
    MSG_STATUS,
    MSG_SESSION_START,
    MSG_METER,
    MSG_SESSION_STOP,
    MSG_ACK,
    MSG_REMOTE_STOP,
)


class ProtocolValidationTests(unittest.TestCase):
    def test_empty_and_whitespace_lines_ignored(self):
        data, err = parse_and_validate_frame("")
        self.assertIsNone(data)
        self.assertIsNone(err)

        data, err = parse_and_validate_frame("   \n\r  ")
        self.assertIsNone(data)
        self.assertIsNone(err)

    def test_malformed_json(self):
        data, err = parse_and_validate_frame("{\"type\": \"HEARTBEAT\", NOT_VALID_JSON\n")
        self.assertIsNone(data)
        self.assertIsNotNone(err)
        err_obj = json.loads(err)
        self.assertFalse(err_obj["ok"])
        self.assertEqual(err_obj["error"], ERR_MALFORMED_JSON)

    def test_missing_envelope_fields(self):
        # Missing type
        data, err = parse_and_validate_frame(
            json.dumps({"charger_id": "SIM-001", "ts": "2026-10-28T14:00:00Z"})
        )
        self.assertIsNone(data)
        self.assertEqual(json.loads(err)["error"], ERR_MISSING_ENVELOPE)

        # Missing charger_id
        data, err = parse_and_validate_frame(
            json.dumps({"type": "HEARTBEAT", "ts": "2026-10-28T14:00:00Z"})
        )
        self.assertIsNone(data)
        self.assertEqual(json.loads(err)["error"], ERR_MISSING_ENVELOPE)

        # Missing ts
        data, err = parse_and_validate_frame(
            json.dumps({"type": "HEARTBEAT", "charger_id": "SIM-001"})
        )
        self.assertIsNone(data)
        self.assertEqual(json.loads(err)["error"], ERR_MISSING_ENVELOPE)

    def test_unknown_message_type(self):
        data, err = parse_and_validate_frame(
            json.dumps({
                "type": "UNKNOWN_ACTION",
                "charger_id": "SIM-001",
                "ts": "2026-10-28T14:00:00Z",
            })
        )
        self.assertIsNone(data)
        self.assertEqual(json.loads(err)["error"], ERR_UNKNOWN_TYPE)

    def test_boot_validation(self):
        # Valid BOOT
        valid_boot = {
            "type": MSG_BOOT,
            "charger_id": "SIM-001",
            "ts": "2026-10-28T14:00:00Z",
            "firmware_version": "v1.0.0",
            "model": "VoltSim-DC",
            "max_power_kw": 50.0,
        }
        data, err = parse_and_validate_frame(json.dumps(valid_boot))
        self.assertIsNotNone(data)
        self.assertIsNone(err)

        # Missing firmware_version
        invalid_boot = valid_boot.copy()
        del invalid_boot["firmware_version"]
        data, err = parse_and_validate_frame(json.dumps(invalid_boot))
        self.assertIsNone(data)
        self.assertEqual(json.loads(err)["error"], ERR_INVALID_PAYLOAD)

        # Invalid max_power_kw (negative)
        bad_power = valid_boot.copy()
        bad_power["max_power_kw"] = -10.0
        data, err = parse_and_validate_frame(json.dumps(bad_power))
        self.assertIsNone(data)
        self.assertEqual(json.loads(err)["error"], ERR_INVALID_PAYLOAD)

    def test_heartbeat_validation(self):
        # Valid HEARTBEAT without uptime
        valid_hb = {
            "type": MSG_HEARTBEAT,
            "charger_id": "SIM-001",
            "ts": "2026-10-28T14:00:10Z",
        }
        data, err = parse_and_validate_frame(json.dumps(valid_hb))
        self.assertIsNotNone(data)
        self.assertIsNone(err)

        # Valid with uptime
        valid_hb["uptime_seconds"] = 120
        data, err = parse_and_validate_frame(json.dumps(valid_hb))
        self.assertIsNotNone(data)
        self.assertIsNone(err)

        # Invalid uptime
        valid_hb["uptime_seconds"] = -5
        data, err = parse_and_validate_frame(json.dumps(valid_hb))
        self.assertIsNone(data)
        self.assertEqual(json.loads(err)["error"], ERR_INVALID_PAYLOAD)

    def test_status_validation(self):
        for status in ["AVAILABLE", "OCCUPIED", "FAULTED"]:
            msg = {
                "type": MSG_STATUS,
                "charger_id": "SIM-001",
                "ts": "2026-10-28T14:05:00Z",
                "status": status,
            }
            data, err = parse_and_validate_frame(json.dumps(msg))
            self.assertIsNotNone(data)
            self.assertIsNone(err)

        # Invalid status
        bad_status = {
            "type": MSG_STATUS,
            "charger_id": "SIM-001",
            "ts": "2026-10-28T14:05:00Z",
            "status": "NON_EXISTENT_STATE",
        }
        data, err = parse_and_validate_frame(json.dumps(bad_status))
        self.assertIsNone(data)
        self.assertEqual(json.loads(err)["error"], ERR_INVALID_PAYLOAD)

    def test_session_start_validation(self):
        # Valid with booking and soc
        valid_start = {
            "type": MSG_SESSION_START,
            "charger_id": "SIM-001",
            "ts": "2026-10-28T14:10:00Z",
            "booking_id": 10,
            "user_id": 2,
            "soc": 25.5,
        }
        data, err = parse_and_validate_frame(json.dumps(valid_start))
        self.assertIsNotNone(data)
        self.assertIsNone(err)

        # Invalid soc (> 100)
        bad_soc = valid_start.copy()
        bad_soc["soc"] = 105.0
        data, err = parse_and_validate_frame(json.dumps(bad_soc))
        self.assertIsNone(data)
        self.assertEqual(json.loads(err)["error"], ERR_INVALID_PAYLOAD)

    def test_meter_validation(self):
        # Valid METER
        valid_meter = {
            "type": MSG_METER,
            "charger_id": "SIM-001",
            "ts": "2026-10-28T14:15:00Z",
            "session_id": 42,
            "kwh_delivered": 1.25,
            "power_kw": 48.5,
            "soc": 30.0,
        }
        data, err = parse_and_validate_frame(json.dumps(valid_meter))
        self.assertIsNotNone(data)
        self.assertIsNone(err)

        # Missing session_id
        bad_meter = valid_meter.copy()
        del bad_meter["session_id"]
        data, err = parse_and_validate_frame(json.dumps(bad_meter))
        self.assertIsNone(data)
        self.assertEqual(json.loads(err)["error"], ERR_INVALID_PAYLOAD)

        # Negative kwh_delivered
        bad_meter = valid_meter.copy()
        bad_meter["kwh_delivered"] = -1.0
        data, err = parse_and_validate_frame(json.dumps(bad_meter))
        self.assertIsNone(data)
        self.assertEqual(json.loads(err)["error"], ERR_INVALID_PAYLOAD)

    def test_session_stop_validation(self):
        # Valid SESSION_STOP
        for reason in [
            "EV_DISCONNECTED",
            "FULL_BATTERY",
            "LOCAL_STOP",
            "REMOTE_STOP",
            "BOOKING_EXPIRED",
            "FAULT",
        ]:
            msg = {
                "type": MSG_SESSION_STOP,
                "charger_id": "SIM-001",
                "ts": "2026-10-28T14:40:00Z",
                "session_id": 42,
                "total_kwh": 20.5,
                "stop_reason": reason,
                "soc_end": 80.0,
            }
            data, err = parse_and_validate_frame(json.dumps(msg))
            self.assertIsNotNone(data)
            self.assertIsNone(err)

        # Invalid stop reason
        bad_stop = {
            "type": MSG_SESSION_STOP,
            "charger_id": "SIM-001",
            "ts": "2026-10-28T14:40:00Z",
            "session_id": 42,
            "total_kwh": 20.5,
            "stop_reason": "UNSUPPORTED_REASON",
        }
        data, err = parse_and_validate_frame(json.dumps(bad_stop))
        self.assertIsNone(data)
        self.assertEqual(json.loads(err)["error"], ERR_INVALID_PAYLOAD)

    def test_build_ack(self):
        ack_str = build_ack(
            charger_id="SIM-001",
            ref_type="BOOT",
            ok=True,
            session_id=10,
        )
        self.assertTrue(ack_str.endswith("\n"))
        ack = json.loads(ack_str)
        self.assertEqual(ack["type"], MSG_ACK)
        self.assertEqual(ack["charger_id"], "SIM-001")
        self.assertEqual(ack["ref_type"], "BOOT")
        self.assertTrue(ack["ok"])
        self.assertEqual(ack["session_id"], 10)

    def test_build_remote_stop(self):
        cmd_str = build_remote_stop(
            charger_id="SIM-002",
            session_id=55,
            reason="ADMIN_OVERRIDE",
        )
        self.assertTrue(cmd_str.endswith("\n"))
        cmd = json.loads(cmd_str)
        self.assertEqual(cmd["type"], MSG_REMOTE_STOP)
        self.assertEqual(cmd["charger_id"], "SIM-002")
        self.assertEqual(cmd["session_id"], 55)
        self.assertEqual(cmd["reason"], "ADMIN_OVERRIDE")


if __name__ == "__main__":
    unittest.main()
