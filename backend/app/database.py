import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("❌ DATABASE_URL environment variable is missing in backend/.env")

# 1. SQLAlchemy Engine
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

# 2. Session Factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 3. Base class for ORM models
Base = declarative_base()

# Dependency to yield database sessions per request
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()