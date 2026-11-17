from sqlalchemy import Column, Integer, String, Float, Numeric, DateTime, Time, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Station(Base):
    __tablename__ = "stations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    city = Column(String(50), nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    address = Column(String, nullable=True)
    status = Column(String(30), default="AVAILABLE")
    price_per_kwh = Column(Numeric(6, 2), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Owner module columns (Migration 012)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True, index=True)
    type = Column(String(10), nullable=False, default="B2P", server_default="B2P")
    open_time = Column(Time, nullable=True)
    close_time = Column(Time, nullable=True)
    rating = Column(Numeric(3, 2), nullable=False, default=0.00, server_default="0")
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    updated_at = Column(DateTime(timezone=True), nullable=True, onupdate=func.now())

    # Relationships
    owner = relationship("User", foreign_keys=[owner_id])
    connectors = relationship("Connector", back_populates="station", cascade="all, delete-orphan")
