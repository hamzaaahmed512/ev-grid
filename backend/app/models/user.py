from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    google_sub = Column(String(255), unique=True, nullable=True)
    phone = Column(String(50), nullable=True)
    city = Column(String(100), nullable=True)
    profile_image_url = Column(Text, nullable=True)
    role = Column(String(20), default="driver", server_default="driver", nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=True,
    )

    # Relationships
    vehicles = relationship("Vehicle", back_populates="user", cascade="all, delete-orphan")
