import unittest
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.database import Base
from app.models.user import User
from app.schemas.user import GoogleLogin
from app.core.google_auth import verify_google_credential
from app.core.security import decode_access_token
from app.routers.auth import google_login


class GoogleCredentialTests(unittest.TestCase):
    def test_missing_configuration(self):
        with patch.object(settings, "GOOGLE_CLIENT_ID", ""):
            with self.assertRaises(HTTPException) as error:
                verify_google_credential("token")
            self.assertEqual(error.exception.status_code, 503)

    def test_invalid_token_rejected(self):
        with patch.object(settings, "GOOGLE_CLIENT_ID", "web-client"), patch(
            "app.core.google_auth.id_token.verify_oauth2_token", side_effect=ValueError
        ):
            with self.assertRaises(HTTPException) as error:
                verify_google_credential("forged-token")
            self.assertEqual(error.exception.status_code, 401)

    def test_audience_is_passed_and_unverified_email_rejected(self):
        with patch.object(settings, "GOOGLE_CLIENT_ID", "expected-client"), patch(
            "app.core.google_auth.id_token.verify_oauth2_token",
            return_value={"sub": "123", "email": "person@gmail.com", "email_verified": False},
        ) as verifier:
            with self.assertRaises(HTTPException):
                verify_google_credential("token")
            self.assertEqual(verifier.call_args.args[2], "expected-client")


class GoogleAccountTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine, tables=[User.__table__])
        self.db = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def sign_in(self, **changes):
        claims = {"sub": "google-123", "email": "person@gmail.com", "email_verified": True, "name": "Test Person"}
        claims.update(changes)
        with patch("app.routers.auth.verify_google_credential", return_value=claims):
            return google_login(GoogleLogin(credential="verified-token"), self.db)

    def test_create_then_return_by_stable_subject(self):
        first = self.sign_in()
        second = self.sign_in(email="changed@gmail.com")
        self.assertEqual(first["user"].id, second["user"].id)
        self.assertEqual(self.db.query(User).count(), 1)
        self.assertEqual(decode_access_token(first["access_token"])["sub"], str(first["user"].id))

    def test_existing_gmail_link_preserves_password(self):
        user = User(name="Existing", email="Person@Gmail.com", password_hash="existing-hash")
        self.db.add(user)
        self.db.commit()
        result = self.sign_in()
        self.assertEqual(result["user"].id, user.id)
        self.assertEqual(user.google_sub, "google-123")
        self.assertEqual(user.password_hash, "existing-hash")

    def test_third_party_email_cannot_take_over_existing_account(self):
        user = User(name="Existing", email="person@example.com", password_hash="existing-hash")
        self.db.add(user)
        self.db.commit()
        with self.assertRaises(HTTPException) as error:
            self.sign_in(email="person@example.com")
        self.assertEqual(error.exception.status_code, 409)
        self.assertIsNone(user.google_sub)

    def test_different_google_subject_cannot_replace_existing_link(self):
        self.sign_in()
        with self.assertRaises(HTTPException) as error:
            self.sign_in(sub="other-subject")
        self.assertEqual(error.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
