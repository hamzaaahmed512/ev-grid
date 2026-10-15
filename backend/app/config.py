import os
from dotenv import load_dotenv

# Load variables from .env file
load_dotenv()

class Settings:
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    
    # Security / JWT Settings
    SECRET_KEY: str = os.getenv("SECRET_KEY", "fallback-secret-key-change-this-2025")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
    
    # CORS (Frontend permissions)
    ALLOWED_ORIGINS: list = [
        origin.strip() 
        for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    ]
    
    # Application Info
    PROJECT_NAME: str = "VoltRelay API"
    VERSION: str = "1.0.0"

# Global settings object
settings = Settings()