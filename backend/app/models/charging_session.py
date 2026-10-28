"""
VoltRelay - ChargingSession SQLAlchemy Model
Maps to the 'charging_sessions' table.
"""

from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class ChargingSession(Base):
    __tablename__ = "charging_sessions"

    id = Column(Integer, primary_key=True, index=True)
    connector_id = Column(Integer, ForeignKey("connectors.id", ondelete="CASCADE"), nullable=False, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    status = Column(String(20), nullable=False, default="ACTIVE", index=True)
    started_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)

    soc_start = Column(Numeric(5, 2), nullable=True)
    soc_end = Column(Numeric(5, 2), nullable=True)

    kwh_delivered = Column(Numeric(8, 4), nullable=False, default=0.0000)
    peak_power_kw = Column(Numeric(6, 2), nullable=False, default=0.00)
    cost = Column(Numeric(10, 2), nullable=False, default=0.00)

    stop_reason = Column(String(100), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    connector = relationship("Connector", lazy="joined")
    booking = relationship("Booking", lazy="joined")
    user = relationship("User", lazy="joined")
