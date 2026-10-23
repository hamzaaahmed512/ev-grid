import asyncio
import json
import unittest
from dataclasses import dataclass

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import REQUIRED_ORIGINS, parse_allowed_origins, settings
from app.core.dependencies import get_current_user
from app.database import Base, get_db
from app.main import app, fastapi_app
from app.models.user import User
from app.models.vehicle import Vehicle


FRONTEND_ORIGIN = "https://ev-grid-eta.vercel.app"


@dataclass
class ASGIResponse:
    status_code: int
    headers: dict[str, str]
    body: bytes

    @property
    def text(self) -> str:
        return self.body.decode()

    def json(self):
        return json.loads(self.body)


def perform_request(asgi_app, method, path, headers=None, body=None):
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
            "query_string": b"",
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
        response_headers = {
            name.decode().lower(): value.decode()
            for name, value in start["headers"]
        }
        return ASGIResponse(start["status"], response_headers, response_body)

    return asyncio.run(send_request())


class CorsConfigurationTests(unittest.TestCase):
    def test_required_frontend_and_local_origins_are_always_allowed(self):
        self.assertTrue(set(REQUIRED_ORIGINS).issubset(settings.ALLOWED_ORIGINS))

    def test_comma_separated_origins_are_normalized_and_preserved(self):
        origins = parse_allowed_origins(
            "https://custom.example/,http://localhost:3000,https://another.example"
        )

        self.assertEqual(origins, [*REQUIRED_ORIGINS, "https://custom.example", "https://another.example"])

    def test_json_origin_array_is_supported(self):
        origins = parse_allowed_origins(
            '["https://custom.example/", "https://second.example"]'
        )

        self.assertEqual(origins, [*REQUIRED_ORIGINS, "https://custom.example", "https://second.example"])

    def test_wildcard_and_non_origin_urls_are_rejected(self):
        for value in (
            "*",
            "https://custom.example/path",
            "https://*.custom.example",
            '["not-an-origin"]',
        ):
            with self.subTest(value=value), self.assertRaises(ValueError):
                parse_allowed_origins(value)


class VehicleCorsTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(
            self.engine,
            tables=[User.__table__, Vehicle.__table__],
        )
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(
            id=1,
            name="Test Driver",
            email="driver@example.test",
            password_hash="unused",
        )
        self.db.add(self.user)
        self.db.commit()

        def override_db():
            yield self.db

        fastapi_app.dependency_overrides[get_db] = override_db
        fastapi_app.dependency_overrides[get_current_user] = lambda: self.user

    def tearDown(self):
        fastapi_app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def test_vehicle_list_works_with_healthy_database_and_cors(self):
        self.db.add(
            Vehicle(
                user_id=self.user.id,
                make="Haval",
                model="H6",
                year=2026,
                battery_capacity_kwh=60,
                connector_type="CCS2",
            )
        )
        self.db.commit()

        response = perform_request(
            app,
            "GET",
            "/vehicles/",
            {"Origin": FRONTEND_ORIGIN},
        )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers["access-control-allow-origin"], FRONTEND_ORIGIN)
        self.assertEqual(response.json()[0]["model"], "H6")

    def test_vehicle_create_works_with_healthy_database_and_cors(self):
        response = perform_request(
            app,
            "POST",
            "/vehicles/",
            {
                "Origin": FRONTEND_ORIGIN,
                "Content-Type": "application/json",
            },
            {
                "make": "Haval",
                "model": "H6",
                "year": 2026,
                "battery_capacity_kwh": 60.0,
                "connector_type": "CCS2",
            },
        )

        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.headers["access-control-allow-origin"], FRONTEND_ORIGIN)
        self.assertEqual(response.json()["make"], "Haval")
        self.assertEqual(response.json()["year"], 2026)
        self.assertEqual(self.db.query(Vehicle).count(), 1)

    def test_preflight_allows_vehicle_get_and_auth_headers(self):
        response = perform_request(
            app,
            "OPTIONS",
            "/vehicles/",
            {
                "Origin": FRONTEND_ORIGIN,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["access-control-allow-origin"], FRONTEND_ORIGIN)
        self.assertIn("GET", response.headers["access-control-allow-methods"])
        self.assertIn("authorization", response.headers["access-control-allow-headers"].lower())
        self.assertIn("content-type", response.headers["access-control-allow-headers"].lower())

    def test_unapproved_origin_is_not_granted_cors_access(self):
        response = perform_request(
            app,
            "GET",
            "/vehicles/",
            {"Origin": "https://unapproved.example"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("access-control-allow-origin", response.headers)

    def test_unhandled_database_failure_keeps_cors_header(self):
        def failed_db():
            raise RuntimeError("database connection details must not be exposed")
            yield

        fastapi_app.dependency_overrides[get_db] = failed_db

        response = perform_request(
            app,
            "GET",
            "/vehicles/",
            {"Origin": FRONTEND_ORIGIN},
        )

        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.headers["access-control-allow-origin"], FRONTEND_ORIGIN)
        self.assertNotIn("database connection details", response.text)


if __name__ == "__main__":
    unittest.main()
