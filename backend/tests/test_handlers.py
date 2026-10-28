"""
VoltRelay — Gateway Message Handlers Unit Tests
Validates database state transitions for all protocol message types using an in-memory SQLite database.
"""

from datetime import datetime, timezone
import json
import unittest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.station import Station
from app.models.connector import Connector
from app.models.booking import Booking
from app.models.charging_session import ChargingSession
from app.gateway.handlers import GatewayMessageHandler
from app.gateway.protocol import (
    MSG_BOOT,
    MSG_HEARTBEAT,
    MSG_STATUS,
    MSG_SESSION_START,
    MSG_METER,
    MSG_SESSION_STOP,
    ERR_UNKNOWN_CHARGER,
    ERR_SESSION_ALREADY_ACTIVE,
    ERR_SESSION_NOT_FOUND,
)


class GatewayHandlersTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(
            self.engine,
            tables=[
                User.__table__,
                Vehicle.__table__,
                Station.__table__,
                Connector.__table__,
                Booking.__table__,
                ChargingSession.__table__,
            ],
        )
        self.Session = sessionmaker(bind=self.engine)
        self.handler = GatewayMessageHandler(session_factory=self.Session)

        # Seed basic station, connector, user, vehicle, booking
        db = self.Session()
        user = User(id=1, email="driver@test.com", password_hash="dummyhash", name="Test Driver")
        db.add(user)
        db.flush()

        vehicle = Vehicle(
            id=1,
            user_id=1,
            make="Tesla",
            model="Model 3",
            year=2024,
            battery_capacity_kwh=75.0,
            connector_type="CCS2",
        )
        db.add(vehicle)
        db.flush()

        station = Station(
            id=1,
            name="VoltRelay Central Hub",
            city="Lahore",
            latitude=31.52,
            longitude=74.35,
            price_per_kwh=50.00,
        )
        db.add(station)
        db.flush()

        connector = Connector(
            id=1,
            station_id=1,
            connector_type="CCS2",
            power_kw=120.0,
            status="OFFLINE",
            charger_id="SIM-001",
            current_power_kw=0.00,
        )
        db.add(connector)
        db.flush()

        booking = Booking(
            id=10,
            user_id=1,
            vehicle_id=1,
            station_id=1,
            connector_id=1,
            start_time=datetime(2026, 10, 28, 14, 0, 0, tzinfo=timezone.utc),
            end_time=datetime(2026, 10, 28, 15, 0, 0, tzinfo=timezone.utc),
            status="CONFIRMED",
        )
        db.add(booking)
        db.commit()
        db.close()

    def tearDown(self):
        self.engine.dispose()

    def test_boot_handler(self):
        # 1. Unknown charger
        msg_unknown = {
            "type": MSG_BOOT,
            "charger_id": "SIM-999",
            "ts": "2026-10-28T14:00:00Z",
            "firmware_version": "v1.0",
            "model": "Sim",
        }
        res = json.loads(self.handler.dispatch(msg_unknown))
        self.assertFalse(res["ok"])
        self.assertEqual(res["error"], ERR_UNKNOWN_CHARGER)

        # 2. Known charger
        msg_known = {
            "type": MSG_BOOT,
            "charger_id": "SIM-001",
            "ts": "2026-10-28T14:00:00Z",
            "firmware_version": "v1.0",
            "model": "Sim",
        }
        res = json.loads(self.handler.dispatch(msg_known))
        self.assertTrue(res["ok"])

        db = self.Session()
        conn = db.query(Connector).filter_by(charger_id="SIM-001").first()
        self.assertEqual(conn.status, "AVAILABLE")
        self.assertIsNotNone(conn.last_seen)
        db.close()

    def test_heartbeat_handler(self):
        msg = {
            "type": MSG_HEARTBEAT,
            "charger_id": "SIM-001",
            "ts": "2026-10-28T14:01:00Z",
        }
        res = json.loads(self.handler.dispatch(msg))
        self.assertTrue(res["ok"])

        db = self.Session()
        conn = db.query(Connector).filter_by(charger_id="SIM-001").first()
        self.assertEqual(conn.status, "AVAILABLE")
        db.close()

    def test_status_handler(self):
        msg = {
            "type": MSG_STATUS,
            "charger_id": "SIM-001",
            "ts": "2026-10-28T14:02:00Z",
            "status": "OCCUPIED",
        }
        res = json.loads(self.handler.dispatch(msg))
        self.assertTrue(res["ok"])

        db = self.Session()
        conn = db.query(Connector).filter_by(charger_id="SIM-001").first()
        self.assertEqual(conn.status, "OCCUPIED")

        # Now set to FAULTED, power should reset to 0
        conn.current_power_kw = 50.0
        db.commit()

        msg_fault = {
            "type": MSG_STATUS,
            "charger_id": "SIM-001",
            "ts": "2026-10-28T14:02:30Z",
            "status": "FAULTED",
        }
        self.handler.dispatch(msg_fault)
        db.refresh(conn)
        self.assertEqual(conn.status, "FAULTED")
        self.assertEqual(float(conn.current_power_kw), 0.00)
        db.close()

    def test_session_lifecycle_flow(self):
        # 1. Start Session with booking_id=10
        start_msg = {
            "type": MSG_SESSION_START,
            "charger_id": "SIM-001",
            "ts": "2026-10-28T14:05:00Z",
            "booking_id": 10,
            "soc": 20.0,
        }
        start_res = json.loads(self.handler.dispatch(start_msg))
        self.assertTrue(start_res["ok"])
        session_id = start_res["session_id"]
        self.assertIsNotNone(session_id)

        # Check connector & booking updated
        db = self.Session()
        conn = db.query(Connector).filter_by(charger_id="SIM-001").first()
        self.assertEqual(conn.status, "OCCUPIED")
        booking = db.query(Booking).filter_by(id=10).first()
        self.assertEqual(booking.status, "IN_PROGRESS")

        # 2. Duplicate Session Start must be rejected
        dup_res = json.loads(self.handler.dispatch(start_msg))
        self.assertFalse(dup_res["ok"])
        self.assertEqual(dup_res["error"], ERR_SESSION_ALREADY_ACTIVE)

        # 3. Telemetry (METER)
        meter_msg = {
            "type": MSG_METER,
            "charger_id": "SIM-001",
            "ts": "2026-10-28T14:15:00Z",
            "session_id": session_id,
            "kwh_delivered": 10.0,
            "power_kw": 60.0,
            "soc": 35.0,
        }
        meter_res = json.loads(self.handler.dispatch(meter_msg))
        self.assertTrue(meter_res["ok"])

        db.refresh(conn)
        self.assertEqual(float(conn.current_power_kw), 60.0)
        session = db.query(ChargingSession).filter_by(id=session_id).first()
        self.assertEqual(float(session.kwh_delivered), 10.0)
        self.assertEqual(float(session.peak_power_kw), 60.0)
        self.assertEqual(float(session.cost), 500.0)  # 10.0 kWh * 50.00 PKR

        # 4. Telemetry for invalid session rejected
        bad_meter = meter_msg.copy()
        bad_meter["session_id"] = 9999
        bad_res = json.loads(self.handler.dispatch(bad_meter))
        self.assertFalse(bad_res["ok"])
        self.assertEqual(bad_res["error"], ERR_SESSION_NOT_FOUND)

        # 5. Stop Session (FULL_BATTERY)
        stop_msg = {
            "type": MSG_SESSION_STOP,
            "charger_id": "SIM-001",
            "ts": "2026-10-28T14:45:00Z",
            "session_id": session_id,
            "total_kwh": 25.0,
            "stop_reason": "FULL_BATTERY",
            "soc_end": 100.0,
        }
        stop_res = json.loads(self.handler.dispatch(stop_msg))
        self.assertTrue(stop_res["ok"])

        # Check DB state
        db.refresh(conn)
        self.assertEqual(conn.status, "AVAILABLE")
        self.assertEqual(float(conn.current_power_kw), 0.0)

        db.refresh(booking)
        self.assertEqual(booking.status, "COMPLETED")

        db.refresh(session)
        self.assertEqual(session.status, "COMPLETED")
        self.assertEqual(float(session.kwh_delivered), 25.0)
        self.assertEqual(float(session.cost), 1250.0)  # 25.0 kWh * 50.00 PKR
        self.assertEqual(session.stop_reason, "FULL_BATTERY")
        self.assertEqual(float(session.soc_end), 100.0)
        db.close()

    def test_mark_charger_offline(self):
        success = self.handler.mark_charger_offline("SIM-001")
        self.assertTrue(success)

        db = self.Session()
        conn = db.query(Connector).filter_by(charger_id="SIM-001").first()
        self.assertEqual(conn.status, "OFFLINE")
        self.assertEqual(float(conn.current_power_kw), 0.0)
        db.close()


if __name__ == "__main__":
    unittest.main()
