import os
from pathlib import Path
from dotenv import load_dotenv

# Load variables from .env file
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

class Settings:
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    
    # Security / JWT Settings
    SECRET_KEY: str = os.getenv("SECRET_KEY", "fallback-secret-key-change-this-2025")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
    
    # CORS (Frontend permissions)
    ALLOWED_ORIGINS: list = [
        origin.strip().rstrip("/")
        for origin in (
            os.getenv("ALLOWED_ORIGINS")
            or os.getenv("CORS_ORIGINS")
            or "http://localhost:3000,http://127.0.0.1:3000,https://ev-grid-eta.vercel.app"
        ).split(",")
        if origin.strip()
    ]
    
    # Application Info
    PROJECT_NAME: str = "VoltRelay API"
    VERSION: str = "1.0.0"

# Global settings object
settings = Settings()
