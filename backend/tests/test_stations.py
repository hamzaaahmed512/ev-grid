import unittest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app, fastapi_app
from app.models.station import Station
from app.models.connector import Connector
from tests.test_cors_and_vehicles import FRONTEND_ORIGIN, perform_request


class StationsApiTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(
            self.engine,
            tables=[Station.__table__, Connector.__table__],
        )
        self.db = sessionmaker(bind=self.engine)()

        def override_db():
            yield self.db

        fastapi_app.dependency_overrides[get_db] = override_db

    def tearDown(self):
        fastapi_app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def test_get_all_stations_cors_and_serialization(self):
        station = Station(
            id=1,
            name="Test Charging Hub",
            city="Lahore",
            latitude=31.52,
            longitude=74.35,
            address="Gulberg III",
            status="AVAILABLE",
            price_per_kwh=80.0,
        )
        self.db.add(station)
        self.db.flush()

        connector = Connector(
            id=1,
            station_id=station.id,
            connector_type="CCS2",
            power_kw=120.0,
            status="AVAILABLE",
            charging_type="DC",
        )
        self.db.add(connector)
        self.db.commit()

        response = perform_request(
            app,
            "GET",
            "/stations/",
            {"Origin": FRONTEND_ORIGIN},
        )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers["access-control-allow-origin"], FRONTEND_ORIGIN)

        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["name"], "Test Charging Hub")
        self.assertEqual(data[0]["price_per_kwh"], 80.0)
        self.assertEqual(len(data[0]["connectors"]), 1)
        self.assertEqual(data[0]["connectors"][0]["connector_type"], "CCS2")
        self.assertEqual(data[0]["connectors"][0]["power_kw"], 120.0)
        self.assertEqual(data[0]["connectors"][0]["max_power_kw"], 120.0)
        self.assertEqual(data[0]["connectors"][0]["price_per_kwh"], 80.0)
        self.assertEqual(data[0]["connectors"][0]["charging_type"], "DC")


if __name__ == "__main__":
    unittest.main()
