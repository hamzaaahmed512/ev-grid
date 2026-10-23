import json
import os
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import load_dotenv

# Load variables from .env file
load_dotenv(Path(__file__).resolve().parent.parent / ".env")


REQUIRED_ORIGINS = (
    "https://ev-grid-eta.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
)


def parse_allowed_origins(value: str | None) -> list[str]:
    """Parse comma-separated or JSON-array origins and retain required app origins."""
    configured_origins: list[str] = []
    if value and value.strip():
        raw_value = value.strip()
        if raw_value.startswith("["):
            try:
                parsed_value = json.loads(raw_value)
            except json.JSONDecodeError as exc:
                raise ValueError("CORS origins must be a comma-separated list or JSON array") from exc
            if not isinstance(parsed_value, list) or not all(
                isinstance(origin, str) for origin in parsed_value
            ):
                raise ValueError("A JSON CORS origin configuration must be an array of strings")
            configured_origins = parsed_value
        else:
            configured_origins = raw_value.split(",")

    normalized_origins = list(REQUIRED_ORIGINS)
    for origin in configured_origins:
        normalized = origin.strip()
        if not normalized:
            continue
        if normalized.endswith("/"):
            normalized = normalized.rstrip("/")
        try:
            parsed_origin = urlsplit(normalized)
            parsed_origin.port
        except ValueError as exc:
            raise ValueError(f"Invalid CORS origin: {origin!r}") from exc
        if (
            normalized == "*"
            or parsed_origin.scheme not in {"http", "https"}
            or not parsed_origin.hostname
            or "*" in parsed_origin.hostname
            or parsed_origin.path
            or parsed_origin.query
            or parsed_origin.fragment
            or parsed_origin.username
            or parsed_origin.password
        ):
            raise ValueError(f"Invalid CORS origin: {origin!r}")
        normalized_origins.append(normalized)

    return list(dict.fromkeys(normalized_origins))


class Settings:
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    
    # Security / JWT Settings
    SECRET_KEY: str = os.getenv("SECRET_KEY", "fallback-secret-key-change-this-2025")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
    
    # CORS (Frontend permissions)
    _configured_origins: str | None = (
        os.getenv("ALLOWED_ORIGINS")
        or os.getenv("CORS_ORIGINS")
    )
    ALLOWED_ORIGINS: list[str] = parse_allowed_origins(_configured_origins)
    
    # Application Info
    PROJECT_NAME: str = "VoltRelay API"
    VERSION: str = "1.0.0"

# Global settings object
settings = Settings()
