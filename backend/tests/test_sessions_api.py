"""
VoltRelay — Sessions & Connectors REST API Unit Tests
Module 5, Part 3

Tests authorization, validation, session history, and remote stop dispatch.
"""

from datetime import datetime, timezone
import unittest
from unittest.mock import AsyncMock, patch, MagicMock
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app, fastapi_app
from app.core.security import create_access_token
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.station import Station
from app.models.connector import Connector
from app.models.booking import Booking
from app.models.charging_session import ChargingSession
from app.gateway.registry import charger_registry
from tests.test_cors_and_vehicles import perform_request


class SessionsApiTests(unittest.TestCase):
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
        self.db = self.Session()

        def override_get_db():
            yield self.db

        fastapi_app.dependency_overrides[get_db] = override_get_db

        # Seed User 1 (Alice) and User 2 (Bob)
        self.user1 = User(id=1, email="alice@test.com", password_hash="dummyhash", name="Alice")
        self.user2 = User(id=2, email="bob@test.com", password_hash="dummyhash", name="Bob")
        self.db.add_all([self.user1, self.user2])
        self.db.flush()

        self.token1 = create_access_token(data={"sub": str(self.user1.id)})
        self.token2 = create_access_token(data={"sub": str(self.user2.id)})

        self.auth_headers1 = {"Authorization": f"Bearer {self.token1}"}
        self.auth_headers2 = {"Authorization": f"Bearer {self.token2}"}

        # Seed Station and Connector
        self.station = Station(id=1, name="Hub 1", latitude=31.5, longitude=74.3, price_per_kwh=50.0)
        self.connector = Connector(
            id=1,
            station_id=1,
            connector_type="CCS2",
            power_kw=100.0,
            status="AVAILABLE",
            charger_id="SIM-TEST-01",
            current_power_kw=0.0,
        )
        self.db.add_all([self.station, self.connector])
        self.db.flush()

        # Seed Sessions
        # Session 1 belongs to Alice
        self.session1 = ChargingSession(
            id=101,
            connector_id=1,
            user_id=1,
            status="ACTIVE",
            started_at=datetime(2026, 10, 28, 14, 0, 0, tzinfo=timezone.utc),
            kwh_delivered=12.5,
            peak_power_kw=60.0,
            cost=625.0,
        )
        # Session 2 belongs to Bob
        self.session2 = ChargingSession(
            id=102,
            connector_id=1,
            user_id=2,
            status="COMPLETED",
            started_at=datetime(2026, 10, 28, 12, 0, 0, tzinfo=timezone.utc),
            ended_at=datetime(2026, 10, 28, 13, 0, 0, tzinfo=timezone.utc),
            kwh_delivered=20.0,
            peak_power_kw=80.0,
            cost=1000.0,
            stop_reason="FULL_BATTERY",
        )
        self.db.add_all([self.session1, self.session2])
        self.db.commit()

    def tearDown(self):
        fastapi_app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def test_get_my_sessions_authenticated(self):
        # Alice retrieves her sessions
        res = perform_request(app, "GET", "/sessions/me", self.auth_headers1)
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["sessions"][0]["id"], 101)
        self.assertEqual(data["sessions"][0]["status"], "ACTIVE")

        # Bob retrieves his sessions
        res2 = perform_request(app, "GET", "/sessions/me", self.auth_headers2)
        self.assertEqual(res2.status_code, 200, res2.text)
        data2 = res2.json()
        self.assertEqual(data2["count"], 1)
        self.assertEqual(data2["sessions"][0]["id"], 102)
        self.assertEqual(data2["sessions"][0]["status"], "COMPLETED")

    def test_get_my_sessions_unauthenticated(self):
        res = perform_request(app, "GET", "/sessions/me", {})
        self.assertEqual(res.status_code, 401)

    def test_get_session_by_id_authorization(self):
        # Alice views her own session
        res = perform_request(app, "GET", "/sessions/101", self.auth_headers1)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["id"], 101)

        # Bob tries to view Alice's session (Forbidden)
        res_forbidden = perform_request(app, "GET", "/sessions/101", self.auth_headers2)
        self.assertEqual(res_forbidden.status_code, 403)

        # Missing session (Not Found)
        res_not_found = perform_request(app, "GET", "/sessions/999", self.auth_headers1)
        self.assertEqual(res_not_found.status_code, 404)

    def test_get_connector_live_public(self):
        # Public live endpoint returns connector status and active session summary
        self.connector.current_power_kw = 55.0
        self.db.commit()

        res = perform_request(app, "GET", "/connectors/1/live", {})
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()
        self.assertEqual(data["connector_id"], 1)
        self.assertEqual(data["charger_id"], "SIM-TEST-01")
        self.assertEqual(data["status"], "AVAILABLE")
        self.assertEqual(data["current_power_kw"], 55.0)
        self.assertIsNotNone(data["active_session"])
        self.assertEqual(data["active_session"]["session_id"], 101)
        self.assertEqual(data["active_session"]["kwh_delivered"], 12.5)

    def test_request_remote_stop_when_offline_fails(self):
        # Charger SIM-TEST-01 is not registered / connected in charger_registry
        res = perform_request(app, "POST", "/sessions/101/stop", self.auth_headers1)
        self.assertEqual(res.status_code, 409, res.text)
        self.assertIn("offline", res.json()["detail"].lower())

    def test_request_remote_stop_dispatches_when_online(self):
        mock_writer = MagicMock()
        mock_writer.is_closing.return_value = False
        mock_writer.write = MagicMock()
        mock_writer.drain = AsyncMock()

        # Mock registry lookup
        with patch.object(charger_registry, "get_writer", new=AsyncMock(return_value=mock_writer)):
            res = perform_request(app, "POST", "/sessions/101/stop", self.auth_headers1)
            self.assertEqual(res.status_code, 200, res.text)
            data = res.json()
            self.assertTrue(data["ok"])
            self.assertEqual(data["session_id"], 101)

            # Check that REMOTE_STOP JSON frame was written to writer
            mock_writer.write.assert_called_once()
            written_data = mock_writer.write.call_args[0][0].decode("utf-8")
            self.assertIn("REMOTE_STOP", written_data)
            self.assertIn("SIM-TEST-01", written_data)


if __name__ == "__main__":
    unittest.main()
