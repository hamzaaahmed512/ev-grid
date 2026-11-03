import asyncio
import json
import unittest
from dataclasses import dataclass

from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.dependencies import get_current_user
from app.database import Base, get_db
from app.main import app, fastapi_app
from app.models.user import User


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


class ProfileEndpointsTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(
            self.engine,
            tables=[User.__table__],
        )
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(
            id=1,
            name="Sarah Connor",
            email="sarah@example.com",
            password_hash="hashed_pw_here",
            phone="+923001234567",
            city="Lahore",
            profile_image_url="https://example.com/sarah.jpg",
            role="driver",
            created_at=datetime.now(timezone.utc),
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

    def test_get_auth_me_returns_profile_fields(self):
        response = perform_request(app, "GET", "/auth/me")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["id"], 1)
        self.assertEqual(data["name"], "Sarah Connor")
        self.assertEqual(data["email"], "sarah@example.com")
        self.assertEqual(data["phone"], "+923001234567")
        self.assertEqual(data["city"], "Lahore")
        self.assertEqual(data["profile_image_url"], "https://example.com/sarah.jpg")
        self.assertEqual(data["role"], "driver")

    def test_patch_auth_profile_updates_fields(self):
        update_payload = {
            "name": "Sarah J. Connor",
            "phone": "+923009998877",
            "city": "Islamabad",
            "profile_image_url": "https://example.com/avatar2.png",
        }
        response = perform_request(
            app,
            "PATCH",
            "/auth/profile",
            headers={"Content-Type": "application/json"},
            body=update_payload,
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "Sarah J. Connor")
        self.assertEqual(data["phone"], "+923009998877")
        self.assertEqual(data["city"], "Islamabad")
        self.assertEqual(data["profile_image_url"], "https://example.com/avatar2.png")

        # Verify DB persisted
        db_user = self.db.query(User).filter(User.id == 1).first()
        self.assertEqual(db_user.name, "Sarah J. Connor")
        self.assertEqual(db_user.city, "Islamabad")

    def test_patch_auth_me_alias_works(self):
        response = perform_request(
            app,
            "PATCH",
            "/auth/me",
            headers={"Content-Type": "application/json"},
            body={"city": "Karachi"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["city"], "Karachi")

    def test_users_router_get_and_patch_me(self):
        # Test GET /users/me
        get_res = perform_request(app, "GET", "/users/me")
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.json()["email"], "sarah@example.com")

        # Test PATCH /users/me
        patch_res = perform_request(
            app,
            "PATCH",
            "/users/me",
            headers={"Content-Type": "application/json"},
            body={"phone": "+923331112233"},
        )
        self.assertEqual(patch_res.status_code, 200)
        self.assertEqual(patch_res.json()["phone"], "+923331112233")
