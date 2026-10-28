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
    power_kw = Column(Numeric(5, 1), nullable=False, default=50.00)
    status = Column(String(30), nullable=False, default="AVAILABLE")
    charging_type = Column(String(5), nullable=True)
    charger_id = Column(String(50), unique=True, nullable=True, index=True)
    last_seen = Column(DateTime(timezone=True), nullable=True, index=True)
    current_power_kw = Column(Numeric(6, 2), nullable=False, default=0.00)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship back to Station
    station = relationship("Station", back_populates="connectors")

    @property
    def max_power_kw(self):
        """Compatibility property for max_power_kw."""
        return self.power_kw

    @property
    def price_per_kwh(self):
        """Retrieve price from the parent station."""
        if self.station and self.station.price_per_kwh is not None:
            return self.station.price_per_kwh
        return 0.00