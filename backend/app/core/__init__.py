"""
VoltRelay - Station SQLAlchemy Model
"""

from sqlalchemy import Column, Integer, String, Numeric, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Station(Base):
    __tablename__ = "stations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    city = Column(String(100), nullable=False, index=True)
    address = Column(String(500), nullable=False)
    latitude = Column(Numeric(10, 8), nullable=False)
    longitude = Column(Numeric(11, 8), nullable=False)
    status = Column(String(20), nullable=False, default="AVAILABLE")
    price_per_kwh = Column(Numeric(6, 2), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship to connectors
    connectors = relationship("Connector", back_populates="station", cascade="all, delete-orphan")