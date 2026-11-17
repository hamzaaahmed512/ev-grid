"""
VoltRelay - Owner API Tests (Part 2)
Tests run against an isolated in-memory SQLite database.
Never connects to or modifies the Supabase database.
"""

import unittest
from datetime import datetime, timedelta, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.core.dependencies import get_current_user
from app.main import fastapi_app
from app.models.user import User
from app.models.station import Station
from app.models.connector import Connector
from app.models.booking import Booking
from app.models.vehicle import Vehicle
from app.models.status_log import StatusLog
from tests.test_cors_and_vehicles import perform_request


class OwnerApiTests(unittest.TestCase):
    def setUp(self):
        # 1. In-memory SQLite isolated DB
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
                StatusLog.__table__,
            ],
        )
        self.db = sessionmaker(bind=self.engine)()

        # 2. Seed test users
        self.owner_a = User(
            id=10,
            name="Owner Alice",
            email="alice@owner.pk",
            password_hash="hash_a",
            role="business_owner",
        )
        self.owner_b = User(
            id=20,
            name="Owner Bob",
            email="bob@owner.pk",
            password_hash="hash_b",
            role="business_owner",
        )
        self.driver = User(
            id=30,
            name="Driver Dan",
            email="dan@driver.pk",
            password_hash="hash_d",
            role="driver",
        )
        self.db.add_all([self.owner_a, self.owner_b, self.driver])
        self.db.commit()

        # 3. Default active user: Owner A
        self.current_user = self.owner_a

        def override_db():
            yield self.db

        def override_user():
            return self.current_user

        fastapi_app.dependency_overrides[get_db] = override_db
        fastapi_app.dependency_overrides[get_current_user] = override_user

    def tearDown(self):
        fastapi_app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def req(self, method: str, path: str, body: dict = None):
        """Helper to invoke perform_request with Content-Type header."""
        headers = {"Content-Type": "application/json"} if body is not None else {}
        return perform_request(fastapi_app, method, path, headers=headers, body=body)

    # ── TEST 1: Role Guard (Driver gets 403) ───────────────────────────────────

    def test_driver_forbidden_on_owner_endpoints(self):
        self.current_user = self.driver

        res_get = self.req("GET", "/owner/stations")
        self.assertEqual(res_get.status_code, 403)

        res_post = self.req(
            "POST",
            "/owner/stations",
            body={
                "name": "Unauthorized Station",
                "latitude": 31.5,
                "longitude": 74.3,
            },
        )
        self.assertEqual(res_post.status_code, 403)

    # ── TEST 2: Multi-tenant Isolation (404 on another owner's station) ───────

    def test_owner_b_cannot_read_owner_a_station(self):
        station = Station(
            id=101,
            owner_id=self.owner_a.id,
            name="Alice Station",
            latitude=31.52,
            longitude=74.35,
            is_active=True,
        )
        self.db.add(station)
        self.db.commit()

        # Logged in as Owner B
        self.current_user = self.owner_b
        res = self.req("GET", f"/owner/stations/{station.id}")
        self.assertEqual(res.status_code, 404)

    def test_owner_b_cannot_update_owner_a_station(self):
        station = Station(
            id=102,
            owner_id=self.owner_a.id,
            name="Alice Station 2",
            latitude=31.52,
            longitude=74.35,
            is_active=True,
        )
        self.db.add(station)
        self.db.commit()

        self.current_user = self.owner_b
        res = self.req(
            "PUT",
            f"/owner/stations/{station.id}",
            body={
                "name": "Hacked Station",
                "latitude": 31.52,
                "longitude": 74.35,
            },
        )
        self.assertEqual(res.status_code, 404)

    def test_owner_b_cannot_delete_owner_a_station(self):
        station = Station(
            id=103,
            owner_id=self.owner_a.id,
            name="Alice Station 3",
            latitude=31.52,
            longitude=74.35,
            is_active=True,
        )
        self.db.add(station)
        self.db.commit()

        self.current_user = self.owner_b
        res = self.req("DELETE", f"/owner/stations/{station.id}")
        self.assertEqual(res.status_code, 404)

    # ── TEST 3: Multi-tenant Isolation on Connectors (404) ────────────────────

    def test_owner_b_cannot_modify_owner_a_connector(self):
        station = Station(
            id=104,
            owner_id=self.owner_a.id,
            name="Alice Station 4",
            latitude=31.52,
            longitude=74.35,
            is_active=True,
        )
        self.db.add(station)
        self.db.flush()

        connector = Connector(
            id=201,
            station_id=station.id,
            label="Bay 1",
            connector_type="CCS2",
            power_kw=50.0,
            status="AVAILABLE",
            is_active=True,
        )
        self.db.add(connector)
        self.db.commit()

        # Owner B tries to update Owner A's connector
        self.current_user = self.owner_b
        res_put = self.req(
            "PUT",
            f"/owner/connectors/{connector.id}",
            body={
                "label": "Hacked Bay",
                "connector_type": "CCS2",
                "power_kw": 60.0,
            },
        )
        self.assertEqual(res_put.status_code, 404)

        res_patch = self.req(
            "PATCH",
            f"/owner/connectors/{connector.id}/status",
            body={"status": "OFFLINE"},
        )
        self.assertEqual(res_patch.status_code, 404)

        res_del = self.req("DELETE", f"/owner/connectors/{connector.id}")
        self.assertEqual(res_del.status_code, 404)

    # ── TEST 4: Create Station (forces B2P, owner_id=me, AVAILABLE) ───────────

    def test_create_station_forces_b2p_and_owner_id(self):
        self.current_user = self.owner_a
        payload = {
            "name": "Gulberg Mega Hub",
            "city": "Lahore",
            "address": "Main Boulevard, Gulberg",
            "latitude": 31.5204,
            "longitude": 74.3587,
            "open_time": "08:00",
            "close_time": "22:00",
            "price_per_kwh": 55.0,
        }
        res = self.req("POST", "/owner/stations", body=payload)
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data["name"], "Gulberg Mega Hub")
        self.assertEqual(data["type"], "B2P")
        self.assertEqual(data["owner_id"], self.owner_a.id)
        self.assertEqual(data["status"], "AVAILABLE")
        self.assertTrue(data["is_active"])
        self.assertEqual(data["connectors"], [])

    # ── TEST 5: B2P Station Connector Limit (Max 6 -> 7th returns 409) ─────────

    def test_b2p_station_connector_limit_7th_returns_409(self):
        self.current_user = self.owner_a
        station = Station(
            id=105,
            owner_id=self.owner_a.id,
            name="B2P Station Hub",
            type="B2P",
            latitude=31.5,
            longitude=74.3,
            is_active=True,
        )
        self.db.add(station)
        self.db.commit()

        # Add 6 connectors (all succeed)
        for i in range(1, 7):
            res = self.req(
                "POST",
                f"/owner/stations/{station.id}/connectors",
                body={
                    "label": f"Bay {i}",
                    "connector_type": "CCS2",
                    "power_kw": 50.0,
                    "price_per_kwh": 60.0,
                },
            )
            self.assertEqual(res.status_code, 201)

        # 7th connector must fail with 409
        res_7 = self.req(
            "POST",
            f"/owner/stations/{station.id}/connectors",
            body={
                "label": "Bay 7",
                "connector_type": "CCS2",
                "power_kw": 50.0,
                "price_per_kwh": 60.0,
            },
        )
        self.assertEqual(res_7.status_code, 409)
        self.assertIn("at most 6", res_7.json()["detail"].lower())

    # ── TEST 6: P2P Station Connector Limit (Max 1 -> 2nd returns 409) ─────────

    def test_p2p_station_connector_limit_2nd_returns_409(self):
        self.current_user = self.owner_a
        station = Station(
            id=106,
            owner_id=self.owner_a.id,
            name="P2P Home Charger",
            type="P2P",
            latitude=31.5,
            longitude=74.3,
            is_active=True,
        )
        self.db.add(station)
        self.db.commit()

        # First connector succeeds
        res_1 = self.req(
            "POST",
            f"/owner/stations/{station.id}/connectors",
            body={
                "label": "Driveway Plug",
                "connector_type": "Type 2",
                "power_kw": 7.4,
                "price_per_kwh": 40.0,
            },
        )
        self.assertEqual(res_1.status_code, 201)
        self.assertEqual(res_1.json()["charging_type"], "AC")

        # Second connector must fail with 409
        res_2 = self.req(
            "POST",
            f"/owner/stations/{station.id}/connectors",
            body={
                "label": "Driveway Plug 2",
                "connector_type": "Type 2",
                "power_kw": 7.4,
                "price_per_kwh": 40.0,
            },
        )
        self.assertEqual(res_2.status_code, 409)
        self.assertIn("at most 1", res_2.json()["detail"].lower())

    # ── TEST 7: Status PATCH Validation (400 for CHARGING/FAULT) ───────────────

    def test_patch_status_invalid_states_returns_400(self):
        self.current_user = self.owner_a
        station = Station(
            id=107,
            owner_id=self.owner_a.id,
            name="Status Test Station",
            latitude=31.5,
            longitude=74.3,
            is_active=True,
        )
        self.db.add(station)
        self.db.flush()

        connector = Connector(
            id=202,
            station_id=station.id,
            label="Bay 1",
            connector_type="CCS2",
            power_kw=50.0,
            status="AVAILABLE",
            is_active=True,
        )
        self.db.add(connector)
        self.db.commit()

        # CHARGING is not owner-settable -> 400
        res_charging = self.req(
            "PATCH",
            f"/owner/connectors/{connector.id}/status",
            body={"status": "CHARGING"},
        )
        self.assertEqual(res_charging.status_code, 400)

        # FAULT is not owner-settable -> 400
        res_fault = self.req(
            "PATCH",
            f"/owner/connectors/{connector.id}/status",
            body={"status": "FAULT"},
        )
        self.assertEqual(res_fault.status_code, 400)

    # ── TEST 8: Status PATCH Success Writes StatusLog ─────────────────────────

    def test_patch_status_success_writes_status_log(self):
        self.current_user = self.owner_a
        station = Station(
            id=108,
            owner_id=self.owner_a.id,
            name="Log Test Station",
            latitude=31.5,
            longitude=74.3,
            is_active=True,
        )
        self.db.add(station)
        self.db.flush()

        connector = Connector(
            id=203,
            station_id=station.id,
            label="Bay 1",
            connector_type="CCS2",
            power_kw=50.0,
            status="AVAILABLE",
            is_active=True,
        )
        self.db.add(connector)
        self.db.commit()

        res = self.req(
            "PATCH",
            f"/owner/connectors/{connector.id}/status",
            body={"status": "OFFLINE"},
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "OFFLINE")

        # Verify status_logs entry in DB
        log = (
            self.db.query(StatusLog)
            .filter(StatusLog.point_id == connector.id)
            .first()
        )
        self.assertIsNotNone(log)
        self.assertEqual(log.old_status, "AVAILABLE")
        self.assertEqual(log.new_status, "OFFLINE")
        self.assertEqual(log.changed_by_user_id, self.owner_a.id)

    # ── TEST 9: Soft Delete Hides Station from GET /owner/stations ─────────────

    def test_soft_delete_hides_station_from_list(self):
        self.current_user = self.owner_a
        station = Station(
            id=109,
            owner_id=self.owner_a.id,
            name="Deletable Station",
            latitude=31.5,
            longitude=74.3,
            is_active=True,
        )
        self.db.add(station)
        self.db.commit()

        # Before delete: present in list
        res_before = self.req("GET", "/owner/stations")
        self.assertEqual(res_before.status_code, 200)
        station_ids = [s["id"] for s in res_before.json()["items"]]
        self.assertIn(station.id, station_ids)

        # Soft delete
        res_del = self.req("DELETE", f"/owner/stations/{station.id}")
        self.assertEqual(res_del.status_code, 200)

        # After delete: hidden from list
        res_after = self.req("GET", "/owner/stations")
        station_ids_after = [s["id"] for s in res_after.json()["items"]]
        self.assertNotIn(station.id, station_ids_after)

        # Direct GET returns 404
        res_get_direct = self.req("GET", f"/owner/stations/{station.id}")
        self.assertEqual(res_get_direct.status_code, 404)

    # ── TEST 10: Delete Station with Future Booking Returns 409 ───────────────

    def test_delete_station_with_future_booking_returns_409(self):
        self.current_user = self.owner_a
        station = Station(
            id=110,
            owner_id=self.owner_a.id,
            name="Booked Station",
            latitude=31.5,
            longitude=74.3,
            is_active=True,
        )
        self.db.add(station)
        self.db.flush()

        connector = Connector(
            id=204,
            station_id=station.id,
            connector_type="CCS2",
            power_kw=50.0,
            status="AVAILABLE",
            is_active=True,
        )
        self.db.add(connector)
        self.db.flush()

        vehicle = Vehicle(
            id=301,
            user_id=self.driver.id,
            make="Tesla",
            model="Model 3",
            year=2024,
            battery_capacity_kwh=75.0,
            connector_type="CCS2",
        )
        self.db.add(vehicle)
        self.db.flush()

        # Active future booking
        booking = Booking(
            id=401,
            user_id=self.driver.id,
            station_id=station.id,
            connector_id=connector.id,
            vehicle_id=vehicle.id,
            start_time=datetime.now(timezone.utc) + timedelta(hours=1),
            end_time=datetime.now(timezone.utc) + timedelta(hours=2),
            status="CONFIRMED",
        )
        self.db.add(booking)
        self.db.commit()

        # Deleting station must return 409
        res_del_st = self.req("DELETE", f"/owner/stations/{station.id}")
        self.assertEqual(res_del_st.status_code, 409)

        # Deleting connector must return 409
        res_del_conn = self.req("DELETE", f"/owner/connectors/{connector.id}")
        self.assertEqual(res_del_conn.status_code, 409)

    # ── TEST 11: Pydantic Validation Errors Return 422 ─────────────────────────

    def test_validation_errors_return_422(self):
        self.current_user = self.owner_a

        # Name too short (<3 chars)
        res_name = self.req(
            "POST",
            "/owner/stations",
            body={"name": "AB", "latitude": 31.5, "longitude": 74.3},
        )
        self.assertEqual(res_name.status_code, 422)

        # Latitude out of range (>90)
        res_lat = self.req(
            "POST",
            "/owner/stations",
            body={"name": "Valid Name", "latitude": 95.0, "longitude": 74.3},
        )
        self.assertEqual(res_lat.status_code, 422)

        # Longitude out of range (<-180)
        res_lon = self.req(
            "POST",
            "/owner/stations",
            body={"name": "Valid Name", "latitude": 31.5, "longitude": -190.0},
        )
        self.assertEqual(res_lon.status_code, 422)

        # Open time >= close time
        res_hours = self.req(
            "POST",
            "/owner/stations",
            body={
                "name": "Invalid Hours Station",
                "latitude": 31.5,
                "longitude": 74.3,
                "open_time": "22:00",
                "close_time": "08:00",
            },
        )
        self.assertEqual(res_hours.status_code, 422)

        # Connector power_kw out of range (0 or >400)
        station = Station(
            id=111,
            owner_id=self.owner_a.id,
            name="Valid Station For Conn",
            latitude=31.5,
            longitude=74.3,
            is_active=True,
        )
        self.db.add(station)
        self.db.commit()

        res_power = self.req(
            "POST",
            f"/owner/stations/{station.id}/connectors",
            body={"connector_type": "CCS2", "power_kw": 0.0},
        )
        self.assertEqual(res_power.status_code, 422)

        # Connector price_per_kwh < 0
        res_price = self.req(
            "POST",
            f"/owner/stations/{station.id}/connectors",
            body={"connector_type": "CCS2", "power_kw": 50.0, "price_per_kwh": -5.0},
        )
        self.assertEqual(res_price.status_code, 422)

        # Invalid connector type
        res_type = self.req(
            "POST",
            f"/owner/stations/{station.id}/connectors",
            body={"connector_type": "UnknownPlugType999", "power_kw": 50.0},
        )
        self.assertEqual(res_type.status_code, 422)

    # ── TEST 12: Update Station Details & Sets updated_at ───────────────────────

    def test_update_owner_station_success(self):
        self.current_user = self.owner_a
        station = Station(
            id=112,
            owner_id=self.owner_a.id,
            name="Old Station Name",
            latitude=31.5,
            longitude=74.3,
            is_active=True,
        )
        self.db.add(station)
        self.db.commit()

        res = self.req(
            "PUT",
            f"/owner/stations/{station.id}",
            body={
                "name": "New Updated Name",
                "city": "Islamabad",
                "address": "F-7 Markaz",
                "latitude": 33.72,
                "longitude": 73.05,
                "open_time": "06:00",
                "close_time": "23:00",
                "price_per_kwh": 70.0,
            },
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["name"], "New Updated Name")
        self.assertEqual(data["city"], "Islamabad")
        self.assertIsNotNone(data["updated_at"])
