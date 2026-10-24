"""
VoltRelay - Connector SQLAlchemy Model
Maps to the 'connectors' table in Supabase PostgreSQL.
"""

from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Connector(Base):
    __tablename__ = "connectors"

    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(Integer, ForeignKey("stations.id", ondelete="CASCADE"), nullable=False)
    connector_type = Column(String(50), nullable=False, index=True)
    max_power_kw = Column(Numeric(6, 2), nullable=False, default=50.00)
    price_per_kwh = Column(Numeric(6, 2), nullable=False, default=45.00)
    status = Column(String(20), nullable=False, default="AVAILABLE")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship back to Station
    station = relationship("Station", back_populates="connectors")