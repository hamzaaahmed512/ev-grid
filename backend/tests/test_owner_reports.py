"""
VoltRelay - Owner Reports & Analytics Tests (Part 3)
Tests run against an isolated in-memory SQLite database.
Never connects to or modifies the Supabase database.
"""

import asyncio
import json
import unittest
from datetime import datetime, date, time, timedelta, timezone
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
from app.services.owner_analytics_service import (
    compute_utilization_percent,
    get_station_daily_open_hours,
)
from tests.test_cors_and_vehicles import ASGIResponse


def perform_request_with_query(asgi_app, method, full_path, headers=None, body=None):
    if "?" in full_path:
        path, query_string = full_path.split("?", 1)
    else:
        path, query_string = full_path, ""

    async def send_request():
        messages = []
        request_sent = False
        request_body = json.dumps(body).encode() if body is not None else b""

        async def receive():
            nonlocal request_sent
            if not request_sent:
                request_sent = True
                return {
                    "type": "http.request",
                    "body": request_body,
                    "more_body": False,
                }
            return {"type": "http.disconnect"}

        async def send(message):
            messages.append(message)

        raw_headers = [
            (name.lower().encode(), value.encode())
            for name, value in (headers or {}).items()
        ]
        scope = {
            "type": "http",
            "asgi": {"version": "3.0", "spec_version": "2.3"},
            "http_version": "1.1",
            "method": method,
            "scheme": "http",
            "path": path,
            "raw_path": path.encode(),
            "query_string": query_string.encode(),
            "root_path": "",
            "headers": raw_headers,
            "client": ("testclient", 50000),
            "server": ("testserver", 80),
        }
        try:
            await asgi_app(scope, receive, send)
        except Exception:
            if not any(message["type"] == "http.response.start" for message in messages):
                raise
        start = next(message for message in messages if message["type"] == "http.response.start")
        response_body = b"".join(
            message.get("body", b"")
            for message in messages
            if message["type"] == "http.response.body"
        )
        return ASGIResponse(
            status_code=start["status"],
            headers=dict(start.get("headers", [])),
            body=response_body,
        )

    return asyncio.run(send_request())


class OwnerReportsTests(unittest.TestCase):
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

        # Seed driver's vehicle for foreign key validity
        self.vehicle = Vehicle(
            id=1,
            user_id=self.driver.id,
            make="Tesla",
            model="Model 3",
            year=2023,
            nickname="Dan's Tesla",
            connector_type="Type 2",
            battery_capacity_kwh=75.0,
        )
        self.db.add(self.vehicle)
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
        """Helper to invoke perform_request with Content-Type header and query param support."""
        headers = {"Content-Type": "application/json"} if body is not None else {}
        return perform_request_with_query(fastapi_app, method, path, headers=headers, body=body)

    # ── TEST 1: Driver Gets 403 Forbidden on Owner Endpoints ─────────────────

    def test_driver_forbidden_on_owner_reports_endpoints(self):
        self.current_user = self.driver

        res1 = self.req("GET", "/owner/bookings")
        self.assertEqual(res1.status_code, 403)

        res2 = self.req("GET", "/owner/bookings/upcoming")
        self.assertEqual(res2.status_code, 403)

        res3 = self.req("GET", "/owner/earnings")
        self.assertEqual(res3.status_code, 403)

        res4 = self.req("GET", "/owner/dashboard")
        self.assertEqual(res4.status_code, 403)

    # ── TEST 2: Empty Data Returns Zeros and Empty Lists ─────────────────────

    def test_empty_data_returns_zeros_and_empty_lists(self):
        # Owner A has 0 stations and 0 bookings
        res_dash = self.req("GET", "/owner/dashboard")
        self.assertEqual(res_dash.status_code, 200)
        dash = res_dash.json()
        self.assertEqual(dash["total_stations"], 0)
        self.assertEqual(dash["total_connectors"], 0)
        self.assertEqual(dash["today_bookings_count"], 0)
        self.assertEqual(dash["upcoming_bookings"], [])
        self.assertEqual(dash["estimated_revenue_this_month"], 0.0)
        self.assertEqual(dash["estimated_revenue_last_month"], 0.0)
        self.assertEqual(dash["utilization_last_7_days"], [])
        self.assertEqual(dash["connectors_by_status"]["AVAILABLE"], 0)

        res_b = self.req("GET", "/owner/bookings")
        self.assertEqual(res_b.status_code, 200)
        b_data = res_b.json()
        self.assertEqual(b_data["total"], 0)
        self.assertEqual(b_data["bookings"], [])

        res_up = self.req("GET", "/owner/bookings/upcoming")
        self.assertEqual(res_up.status_code, 200)
        self.assertEqual(res_up.json(), [])

        res_earn = self.req("GET", "/owner/earnings")
        self.assertEqual(res_earn.status_code, 200)
        earn = res_earn.json()
        self.assertEqual(earn["estimated_revenue"], 0.0)
        self.assertEqual(earn["estimated_energy_kwh"], 0.0)
        self.assertEqual(earn["completed_bookings"], 0)
        self.assertEqual(earn["station_breakdown"], [])

    # ── TEST 3: Isolation Between Two Owners (Bookings) ──────────────────────

    def test_two_owners_with_bookings_isolation(self):
        # Station A (Owner A)
        st_a = Station(id=1, owner_id=self.owner_a.id, name="Station A", latitude=24.8, longitude=67.0, is_active=True)
        # Station B (Owner B)
        st_b = Station(id=2, owner_id=self.owner_b.id, name="Station B", latitude=31.5, longitude=74.3, is_active=True)
        self.db.add_all([st_a, st_b])
        self.db.commit()

        c_a = Connector(id=1, station_id=st_a.id, connector_type="CCS2", label="Bay A1", power_kw=50.0, price_per_kwh=40.0)
        c_b = Connector(id=2, station_id=st_b.id, connector_type="Type 2", label="Bay B1", power_kw=22.0, price_per_kwh=30.0)
        self.db.add_all([c_a, c_b])
        self.db.commit()

        now = datetime.now(timezone.utc)
        b_a = Booking(
            id=101,
            user_id=self.driver.id,
            vehicle_id=self.vehicle.id,
            station_id=st_a.id,
            connector_id=c_a.id,
            start_time=now - timedelta(hours=3),
            end_time=now - timedelta(hours=1),
            status="COMPLETED",
        )
        b_b = Booking(
            id=102,
            user_id=self.driver.id,
            vehicle_id=self.vehicle.id,
            station_id=st_b.id,
            connector_id=c_b.id,
            start_time=now - timedelta(hours=3),
            end_time=now - timedelta(hours=1),
            status="COMPLETED",
        )
        self.db.add_all([b_a, b_b])
        self.db.commit()

        # Owner A queries bookings: should only see Booking A
        res_a = self.req("GET", "/owner/bookings")
        self.assertEqual(res_a.status_code, 200)
        data_a = res_a.json()
        self.assertEqual(data_a["total"], 1)
        self.assertEqual(data_a["bookings"][0]["booking_id"], 101)
        self.assertEqual(data_a["bookings"][0]["station_name"], "Station A")

        # Owner A cannot filter by Owner B's station (returns 404 for isolation)
        res_st_b = self.req("GET", f"/owner/bookings?station_id={st_b.id}")
        self.assertEqual(res_st_b.status_code, 404)

        # Owner A cannot filter by Owner B's connector (returns 404)
        res_c_b = self.req("GET", f"/owner/bookings?connector_id={c_b.id}")
        self.assertEqual(res_c_b.status_code, 404)

        # Switch to Owner B: should only see Booking B
        self.current_user = self.owner_b
        res_b = self.req("GET", "/owner/bookings")
        self.assertEqual(res_b.status_code, 200)
        data_b = res_b.json()
        self.assertEqual(data_b["total"], 1)
        self.assertEqual(data_b["bookings"][0]["booking_id"], 102)
        self.assertEqual(data_b["bookings"][0]["station_name"], "Station B")

    # ── TEST 4: Isolation in Earnings ────────────────────────────────────────

    def test_two_owners_earnings_isolation(self):
        st_a = Station(id=1, owner_id=self.owner_a.id, name="Station A", latitude=24.8, longitude=67.0, price_per_kwh=40.0, is_active=True)
        st_b = Station(id=2, owner_id=self.owner_b.id, name="Station B", latitude=31.5, longitude=74.3, price_per_kwh=30.0, is_active=True)
        self.db.add_all([st_a, st_b])
        self.db.commit()

        c_a = Connector(id=1, station_id=st_a.id, connector_type="CCS2", power_kw=50.0, price_per_kwh=40.0)
        c_b = Connector(id=2, station_id=st_b.id, connector_type="CCS2", power_kw=100.0, price_per_kwh=50.0)
        self.db.add_all([c_a, c_b])
        self.db.commit()

        # 2 hours at 50 kW = 100 kWh * 40 = 4000
        now = datetime.now(timezone.utc)
        b_a = Booking(
            id=1, user_id=self.driver.id, vehicle_id=self.vehicle.id,
            station_id=st_a.id, connector_id=c_a.id,
            start_time=now - timedelta(hours=4), end_time=now - timedelta(hours=2),
            status="COMPLETED",
        )
        # 1 hour at 100 kW = 100 kWh * 50 = 5000
        b_b = Booking(
            id=2, user_id=self.driver.id, vehicle_id=self.vehicle.id,
            station_id=st_b.id, connector_id=c_b.id,
            start_time=now - timedelta(hours=4), end_time=now - timedelta(hours=3),
            status="COMPLETED",
        )
        self.db.add_all([b_a, b_b])
        self.db.commit()

        # Owner A checks earnings
        res = self.req("GET", f"/owner/earnings?date_from={(now - timedelta(days=2)).date()}&date_to={now.date()}")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["completed_bookings"], 1)
        self.assertAlmostEqual(data["estimated_revenue"], 4000.0, places=1)
        self.assertAlmostEqual(data["estimated_energy_kwh"], 100.0, places=1)

        # Owner A querying Owner B's station returns 404
        res_404 = self.req("GET", f"/owner/earnings?station_id={st_b.id}")
        self.assertEqual(res_404.status_code, 404)

    # ── TEST 5: Status Filter on Bookings ─────────────────────────────────────

    def test_bookings_status_filter(self):
        st = Station(id=1, owner_id=self.owner_a.id, name="Station 1", latitude=24.8, longitude=67.0, is_active=True)
        self.db.add(st)
        self.db.commit()

        c = Connector(id=1, station_id=st.id, connector_type="CCS2", power_kw=50.0)
        self.db.add(c)
        self.db.commit()

        now = datetime.now(timezone.utc)
        b_conf = Booking(id=1, user_id=self.driver.id, vehicle_id=self.vehicle.id, station_id=st.id, connector_id=c.id, start_time=now + timedelta(hours=1), end_time=now + timedelta(hours=2), status="CONFIRMED")
        b_comp = Booking(id=2, user_id=self.driver.id, vehicle_id=self.vehicle.id, station_id=st.id, connector_id=c.id, start_time=now - timedelta(hours=5), end_time=now - timedelta(hours=4), status="COMPLETED")
        b_canc = Booking(id=3, user_id=self.driver.id, vehicle_id=self.vehicle.id, station_id=st.id, connector_id=c.id, start_time=now - timedelta(hours=2), end_time=now - timedelta(hours=1), status="CANCELLED")
        self.db.add_all([b_conf, b_comp, b_canc])
        self.db.commit()

        res_conf = self.req("GET", "/owner/bookings?status=CONFIRMED")
        self.assertEqual(res_conf.json()["total"], 1)
        self.assertEqual(res_conf.json()["bookings"][0]["status"], "CONFIRMED")

        res_comp = self.req("GET", "/owner/bookings?status=completed")  # case-insensitive
        self.assertEqual(res_comp.json()["total"], 1)
        self.assertEqual(res_comp.json()["bookings"][0]["status"], "COMPLETED")

        res_canc = self.req("GET", "/owner/bookings?status=CANCELLED")
        self.assertEqual(res_canc.json()["total"], 1)
        self.assertEqual(res_canc.json()["bookings"][0]["status"], "CANCELLED")

    # ── TEST 6: Date Filter on Bookings ──────────────────────────────────────

    def test_bookings_date_filter(self):
        st = Station(id=1, owner_id=self.owner_a.id, name="Station 1", latitude=24.8, longitude=67.0, is_active=True)
        self.db.add(st)
        self.db.commit()

        c = Connector(id=1, station_id=st.id, connector_type="CCS2", power_kw=50.0)
        self.db.add(c)
        self.db.commit()

        b1 = Booking(id=1, user_id=self.driver.id, vehicle_id=self.vehicle.id, station_id=st.id, connector_id=c.id, start_time=datetime(2026, 11, 1, 10, 0, tzinfo=timezone.utc), end_time=datetime(2026, 11, 1, 11, 0, tzinfo=timezone.utc), status="COMPLETED")
        b2 = Booking(id=2, user_id=self.driver.id, vehicle_id=self.vehicle.id, station_id=st.id, connector_id=c.id, start_time=datetime(2026, 11, 10, 10, 0, tzinfo=timezone.utc), end_time=datetime(2026, 11, 10, 11, 0, tzinfo=timezone.utc), status="COMPLETED")
        b3 = Booking(id=3, user_id=self.driver.id, vehicle_id=self.vehicle.id, station_id=st.id, connector_id=c.id, start_time=datetime(2026, 11, 20, 10, 0, tzinfo=timezone.utc), end_time=datetime(2026, 11, 20, 11, 0, tzinfo=timezone.utc), status="COMPLETED")
        self.db.add_all([b1, b2, b3])
        self.db.commit()

        res = self.req("GET", "/owner/bookings?date_from=2026-11-05&date_to=2026-11-15")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["total"], 1)
        self.assertEqual(data["bookings"][0]["booking_id"], 2)

    # ── TEST 7: Bookings Pagination ──────────────────────────────────────────

    def test_bookings_pagination(self):
        st = Station(id=1, owner_id=self.owner_a.id, name="Station 1", latitude=24.8, longitude=67.0, is_active=True)
        self.db.add(st)
        self.db.commit()

        c = Connector(id=1, station_id=st.id, connector_type="CCS2", power_kw=50.0)
        self.db.add(c)
        self.db.commit()

        now = datetime.now(timezone.utc)
        for i in range(1, 6):
            self.db.add(Booking(
                id=i, user_id=self.driver.id, vehicle_id=self.vehicle.id, station_id=st.id, connector_id=c.id,
                start_time=now - timedelta(days=i), end_time=now - timedelta(days=i, hours=-1), status="COMPLETED"
            ))
        self.db.commit()

        p1 = self.req("GET", "/owner/bookings?page=1&page_size=2").json()
        self.assertEqual(p1["total"], 5)
        self.assertEqual(len(p1["bookings"]), 2)

        p2 = self.req("GET", "/owner/bookings?page=2&page_size=2").json()
        self.assertEqual(p2["total"], 5)
        self.assertEqual(len(p2["bookings"]), 2)

        p3 = self.req("GET", "/owner/bookings?page=3&page_size=2").json()
        self.assertEqual(p3["total"], 5)
        self.assertEqual(len(p3["bookings"]), 1)

    # ── TEST 8: Upcoming Bookings (Top 10, Soonest First) ─────────────────────

    def test_upcoming_bookings_order_and_filter(self):
        st = Station(id=1, owner_id=self.owner_a.id, name="Station 1", latitude=24.8, longitude=67.0, is_active=True)
        self.db.add(st)
        self.db.commit()

        c = Connector(id=1, station_id=st.id, connector_type="CCS2", power_kw=50.0)
        self.db.add(c)
        self.db.commit()

        now = datetime.now(timezone.utc)
        # Past booking
        b_past = Booking(id=1, user_id=self.driver.id, vehicle_id=self.vehicle.id, station_id=st.id, connector_id=c.id, start_time=now - timedelta(hours=2), end_time=now - timedelta(hours=1), status="CONFIRMED")
        # Soonest future booking
        b_soon = Booking(id=2, user_id=self.driver.id, vehicle_id=self.vehicle.id, station_id=st.id, connector_id=c.id, start_time=now + timedelta(hours=2), end_time=now + timedelta(hours=3), status="CONFIRMED")
        # Later future booking
        b_later = Booking(id=3, user_id=self.driver.id, vehicle_id=self.vehicle.id, station_id=st.id, connector_id=c.id, start_time=now + timedelta(hours=5), end_time=now + timedelta(hours=6), status="CONFIRMED")
        # Future CANCELLED booking (must be ignored)
        b_canc = Booking(id=4, user_id=self.driver.id, vehicle_id=self.vehicle.id, station_id=st.id, connector_id=c.id, start_time=now + timedelta(hours=1), end_time=now + timedelta(hours=2), status="CANCELLED")
        self.db.add_all([b_past, b_soon, b_later, b_canc])
        self.db.commit()

        res = self.req("GET", "/owner/bookings/upcoming")
        self.assertEqual(res.status_code, 200)
        items = res.json()
        self.assertEqual(len(items), 2)
        # Soonest first: b_soon (id=2), then b_later (id=3)
        self.assertEqual(items[0]["booking_id"], 2)
        self.assertEqual(items[1]["booking_id"], 3)

    # ── TEST 9: Earnings Count ONLY COMPLETED Bookings ────────────────────────

    def test_earnings_count_only_completed(self):
        st = Station(id=1, owner_id=self.owner_a.id, name="Station 1", latitude=24.8, longitude=67.0, price_per_kwh=40.0, is_active=True)
        self.db.add(st)
        self.db.commit()

        c = Connector(id=1, station_id=st.id, connector_type="CCS2", power_kw=50.0, price_per_kwh=40.0)
        self.db.add(c)
        self.db.commit()

        now = datetime.now(timezone.utc)
        # 2 hours at 50 kW = 100 kWh * 40 = 4000
        b_comp = Booking(id=1, user_id=self.driver.id, vehicle_id=self.vehicle.id, station_id=st.id, connector_id=c.id, start_time=now - timedelta(hours=5), end_time=now - timedelta(hours=3), status="COMPLETED")
        b_conf = Booking(id=2, user_id=self.driver.id, vehicle_id=self.vehicle.id, station_id=st.id, connector_id=c.id, start_time=now - timedelta(hours=2), end_time=now - timedelta(hours=1), status="CONFIRMED")
        b_canc = Booking(id=3, user_id=self.driver.id, vehicle_id=self.vehicle.id, station_id=st.id, connector_id=c.id, start_time=now - timedelta(hours=1), end_time=now, status="CANCELLED")
        self.db.add_all([b_comp, b_conf, b_canc])
        self.db.commit()

        res = self.req("GET", f"/owner/earnings?date_from={(now - timedelta(days=2)).date()}&date_to={now.date()}")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["completed_bookings"], 1)
        self.assertAlmostEqual(data["estimated_revenue"], 4000.0, places=1)
        self.assertAlmostEqual(data["estimated_energy_kwh"], 100.0, places=1)

    # ── TEST 10: Price Fallback (Connector Price -> Station Price -> 0) ───────

    def test_price_fallback_logic(self):
        st1 = Station(id=1, owner_id=self.owner_a.id, name="Station 1", latitude=24.8, longitude=67.0, price_per_kwh=30.0, is_active=True)
        st2 = Station(id=2, owner_id=self.owner_a.id, name="Station 2", latitude=24.8, longitude=67.0, price_per_kwh=None, is_active=True)
        self.db.add_all([st1, st2])
        self.db.commit()

        # Connector 1 has own price 50.0 (overrides station price 30.0)
        c1 = Connector(id=1, station_id=st1.id, connector_type="CCS2", power_kw=50.0, price_per_kwh=50.0)
        # Connector 2 has None (falls back to station price 30.0)
        c2 = Connector(id=2, station_id=st1.id, connector_type="CCS2", power_kw=50.0, price_per_kwh=None)
        # Connector 3 has None and station price is None (falls back to 0.0)
        c3 = Connector(id=3, station_id=st2.id, connector_type="CCS2", power_kw=50.0, price_per_kwh=None)
        self.db.add_all([c1, c2, c3])
        self.db.commit()

        now = datetime.now(timezone.utc)
        # 1 hour * 50 kW = 50 kWh * 50 = 2500
        b1 = Booking(id=1, user_id=self.driver.id, vehicle_id=self.vehicle.id, station_id=st1.id, connector_id=c1.id, start_time=now - timedelta(hours=6), end_time=now - timedelta(hours=5), status="COMPLETED")
        # 1 hour * 50 kW = 50 kWh * 30 = 1500
        b2 = Booking(id=2, user_id=self.driver.id, vehicle_id=self.vehicle.id, station_id=st1.id, connector_id=c2.id, start_time=now - timedelta(hours=4), end_time=now - timedelta(hours=3), status="COMPLETED")
        # 1 hour * 50 kW = 50 kWh * 0 = 0
        b3 = Booking(id=3, user_id=self.driver.id, vehicle_id=self.vehicle.id, station_id=st2.id, connector_id=c3.id, start_time=now - timedelta(hours=2), end_time=now - timedelta(hours=1), status="COMPLETED")
        self.db.add_all([b1, b2, b3])
        self.db.commit()

        res = self.req("GET", f"/owner/earnings?date_from={(now - timedelta(days=2)).date()}&date_to={now.date()}")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["completed_bookings"], 3)
        self.assertAlmostEqual(data["estimated_energy_kwh"], 150.0, places=1)
        # 2500 + 1500 + 0 = 4000
        self.assertAlmostEqual(data["estimated_revenue"], 4000.0, places=1)

    # ── TEST 11: Earnings Time Series Gap Filling ────────────────────────────

    def test_earnings_time_series_gap_filling(self):
        st = Station(id=1, owner_id=self.owner_a.id, name="Station 1", latitude=24.8, longitude=67.0, price_per_kwh=40.0, is_active=True)
        self.db.add(st)
        self.db.commit()

        c = Connector(id=1, station_id=st.id, connector_type="CCS2", power_kw=50.0, price_per_kwh=40.0)
        self.db.add(c)
        self.db.commit()

        # Only one booking on 2026-11-02
        b = Booking(
            id=1, user_id=self.driver.id, vehicle_id=self.vehicle.id, station_id=st.id, connector_id=c.id,
            start_time=datetime(2026, 11, 2, 10, 0, tzinfo=timezone.utc),
            end_time=datetime(2026, 11, 2, 12, 0, tzinfo=timezone.utc),
            status="COMPLETED",
        )
        self.db.add(b)
        self.db.commit()

        # Query 5 days: 2026-11-01 through 2026-11-05
        res = self.req("GET", "/owner/earnings?date_from=2026-11-01&date_to=2026-11-05&group_by=day")
        self.assertEqual(res.status_code, 200)
        ts = res.json()["time_series"]
        self.assertEqual(len(ts), 5)

        # Check all dates are present in sequential order
        expected_dates = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"]
        self.assertEqual([p["date"] for p in ts], expected_dates)

        # 2026-11-01: zero
        self.assertEqual(ts[0]["completed_bookings"], 0)
        self.assertEqual(ts[0]["estimated_revenue"], 0.0)

        # 2026-11-02: 2h * 50kW * 40 = 4000
        self.assertEqual(ts[1]["completed_bookings"], 1)
        self.assertAlmostEqual(ts[1]["estimated_revenue"], 4000.0, places=1)

        # 2026-11-03: zero
        self.assertEqual(ts[2]["completed_bookings"], 0)
        self.assertEqual(ts[2]["estimated_revenue"], 0.0)

    # ── TEST 12: Earnings Group By Month ─────────────────────────────────────

    def test_earnings_group_by_month(self):
        st = Station(id=1, owner_id=self.owner_a.id, name="Station 1", latitude=24.8, longitude=67.0, price_per_kwh=40.0, is_active=True)
        self.db.add(st)
        self.db.commit()

        c = Connector(id=1, station_id=st.id, connector_type="CCS2", power_kw=50.0, price_per_kwh=40.0)
        self.db.add(c)
        self.db.commit()

        b = Booking(
            id=1, user_id=self.driver.id, vehicle_id=self.vehicle.id, station_id=st.id, connector_id=c.id,
            start_time=datetime(2026, 9, 15, 10, 0, tzinfo=timezone.utc),
            end_time=datetime(2026, 9, 15, 11, 0, tzinfo=timezone.utc),
            status="COMPLETED",
        )
        self.db.add(b)
        self.db.commit()

        # Query 3 months: Sep to Nov 2026
        res = self.req("GET", "/owner/earnings?date_from=2026-09-01&date_to=2026-11-30&group_by=month")
        self.assertEqual(res.status_code, 200)
        ts = res.json()["time_series"]
        self.assertEqual(len(ts), 3)
        self.assertEqual([p["date"] for p in ts], ["2026-09", "2026-10", "2026-11"])
        self.assertEqual(ts[0]["completed_bookings"], 1)
        self.assertEqual(ts[1]["completed_bookings"], 0)
        self.assertEqual(ts[2]["completed_bookings"], 0)

    # ── TEST 13: Utilization Math (Pure Function & Bounds) ───────────────────

    def test_utilization_math(self):
        # 6 booked hours in a 12-hour open day = 50 percent
        self.assertEqual(compute_utilization_percent(6.0, 12.0), 50.0)
        # Cap at 100 percent
        self.assertEqual(compute_utilization_percent(15.0, 12.0), 100.0)
        # 0 open hours returns 0.0
        self.assertEqual(compute_utilization_percent(6.0, 0.0), 0.0)
        # 0 booked hours returns 0.0
        self.assertEqual(compute_utilization_percent(0.0, 12.0), 0.0)
        # Negative open hours returns 0.0
        self.assertEqual(compute_utilization_percent(6.0, -5.0), 0.0)

        # Operating hours calculation
        self.assertEqual(get_station_daily_open_hours(time(8, 0), time(20, 0)), 12.0)
        self.assertEqual(get_station_daily_open_hours(None, None), 24.0)

    # ── TEST 14: Comprehensive Dashboard Endpoint ────────────────────────────

    def test_dashboard_endpoint_comprehensive(self):
        # 1 active station with open_time 08:00 to 20:00 (12 hrs/day = 84 hrs in 7 days)
        st = Station(
            id=1,
            owner_id=self.owner_a.id,
            name="Downtown Hub",
            latitude=24.8,
            longitude=67.0,
            open_time=time(8, 0),
            close_time=time(20, 0),
            price_per_kwh=40.0,
            is_active=True,
        )
        self.db.add(st)
        self.db.commit()

        c1 = Connector(id=1, station_id=st.id, connector_type="CCS2", power_kw=50.0, status="AVAILABLE", is_active=True)
        c2 = Connector(id=2, station_id=st.id, connector_type="Type 2", power_kw=22.0, status="CHARGING", is_active=True)
        self.db.add_all([c1, c2])
        self.db.commit()

        now = datetime.now(timezone.utc)
        # Booking today
        b_today = Booking(
            id=1, user_id=self.driver.id, vehicle_id=self.vehicle.id, station_id=st.id, connector_id=c1.id,
            start_time=now - timedelta(hours=1), end_time=now, status="COMPLETED"
        )
        # Booking upcoming (tomorrow)
        b_up = Booking(
            id=2, user_id=self.driver.id, vehicle_id=self.vehicle.id, station_id=st.id, connector_id=c2.id,
            start_time=now + timedelta(days=1), end_time=now + timedelta(days=1, hours=1), status="CONFIRMED"
        )
        self.db.add_all([b_today, b_up])
        self.db.commit()

        res = self.req("GET", "/owner/dashboard")
        self.assertEqual(res.status_code, 200)
        d = res.json()
        self.assertEqual(d["total_stations"], 1)
        self.assertEqual(d["total_connectors"], 2)
        self.assertEqual(d["connectors_by_status"]["AVAILABLE"], 1)
        self.assertEqual(d["connectors_by_status"]["CHARGING"], 1)
        self.assertEqual(d["connectors_by_status"]["FAULT"], 0)
        self.assertEqual(d["today_bookings_count"], 1)
        self.assertEqual(len(d["upcoming_bookings"]), 1)
        self.assertEqual(d["upcoming_bookings"][0]["booking_id"], 2)
        self.assertEqual(len(d["utilization_last_7_days"]), 1)
        u = d["utilization_last_7_days"][0]
        self.assertEqual(u["station_id"], 1)
        self.assertEqual(u["open_hours"], 84.0)

    # ── TEST 15: Soft-Deleted Stations Excluded from Totals ───────────────────

    def test_inactive_station_excluded_from_totals(self):
        st_active = Station(id=1, owner_id=self.owner_a.id, name="Active", latitude=24.8, longitude=67.0, is_active=True)
        st_inactive = Station(id=2, owner_id=self.owner_a.id, name="Deleted", latitude=24.8, longitude=67.0, is_active=False)
        self.db.add_all([st_active, st_inactive])
        self.db.commit()

        c1 = Connector(id=1, station_id=st_active.id, connector_type="CCS2", is_active=True)
        c2 = Connector(id=2, station_id=st_inactive.id, connector_type="CCS2", is_active=True)
        self.db.add_all([c1, c2])
        self.db.commit()

        res = self.req("GET", "/owner/dashboard")
        self.assertEqual(res.status_code, 200)
        d = res.json()
        self.assertEqual(d["total_stations"], 1)
        self.assertEqual(d["total_connectors"], 1)

    # ── TEST 16: Validation Errors Return 422 ─────────────────────────────────

    def test_validation_errors(self):
        # 1. date_from > date_to on bookings
        res1 = self.req("GET", "/owner/bookings?date_from=2026-11-10&date_to=2026-11-05")
        self.assertEqual(res1.status_code, 422)

        # 2. Date range > 366 days on earnings
        res2 = self.req("GET", "/owner/earnings?date_from=2024-01-01&date_to=2026-01-01")
        self.assertEqual(res2.status_code, 422)

        # 3. Invalid group_by
        res3 = self.req("GET", "/owner/earnings?group_by=yearly")
        self.assertEqual(res3.status_code, 422)

        # 4. page_size > 100
        res4 = self.req("GET", "/owner/bookings?page_size=150")
        self.assertEqual(res4.status_code, 422)

    # ── TEST 17: Driver Privacy (Display Name Only, Never Email or Phone) ─────

    def test_driver_privacy_no_email_or_phone_exposed(self):
        st = Station(id=1, owner_id=self.owner_a.id, name="Station 1", latitude=24.8, longitude=67.0, is_active=True)
        self.db.add(st)
        self.db.commit()

        c = Connector(id=1, station_id=st.id, connector_type="CCS2", power_kw=50.0)
        self.db.add(c)
        self.db.commit()

        now = datetime.now(timezone.utc)
        b = Booking(id=1, user_id=self.driver.id, vehicle_id=self.vehicle.id, station_id=st.id, connector_id=c.id, start_time=now - timedelta(hours=1), end_time=now, status="COMPLETED")
        self.db.add(b)
        self.db.commit()

        res = self.req("GET", "/owner/bookings")
        self.assertEqual(res.status_code, 200)
        row = res.json()["bookings"][0]
        self.assertEqual(row["driver_name"], "Driver Dan")
        self.assertNotIn("driver_email", row)
        self.assertNotIn("email", row)
        self.assertNotIn("phone", row)

    # ── TEST 18: Backend Role Discovery (/auth/me returns business_owner) ─────

    def test_auth_me_returns_business_owner_role(self):
        # Current user is self.owner_a whose role is 'business_owner'
        res = self.req("GET", "/auth/me")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["role"], "business_owner")
        self.assertEqual(data["name"], "Owner Alice")
        self.assertEqual(data["email"], "alice@owner.pk")
