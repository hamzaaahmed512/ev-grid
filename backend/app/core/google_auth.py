from fastapi import HTTPException
from google.auth.exceptions import GoogleAuthError, TransportError
from google.auth.transport.requests import Request
from google.oauth2 import id_token

from app.config import settings


def verify_google_credential(credential: str) -> dict:
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(503, "Google sign-in is not configured yet.")
    try:
        claims = id_token.verify_oauth2_token(
            credential, Request(), settings.GOOGLE_CLIENT_ID
        )
    except TransportError:
        raise HTTPException(503, "Google sign-in is temporarily unavailable. Please try again.")
    except (ValueError, GoogleAuthError):
        raise HTTPException(401, "Google sign-in could not be verified. Please try again.")
    if not claims.get("sub") or not claims.get("email") or claims.get("email_verified") is not True:
        raise HTTPException(401, "A verified Google email address is required.")
    return claims
