"""
VoltRelay - Connector SQLAlchemy Model
Maps to the 'connectors' table in Supabase PostgreSQL.
"""

from sqlalchemy import Column, Integer, String, Numeric, DateTime, Boolean, ForeignKey
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Connector(Base):
    __tablename__ = "connectors"

    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(Integer, ForeignKey("stations.id", ondelete="CASCADE"), nullable=False, index=True)
    connector_type = Column(String(50), nullable=False, index=True)
    power_kw = Column(Numeric(8, 2), nullable=False, default=50.00)
    status = Column(String(30), nullable=False, default="AVAILABLE")
    charging_type = Column(String(5), nullable=True)
    charger_id = Column(String(50), unique=True, nullable=True, index=True)
    last_seen = Column(DateTime(timezone=True), nullable=True, index=True)
    current_power_kw = Column(Numeric(6, 2), nullable=False, default=0.00)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Owner module columns (Migration 012)
    label = Column(String(50), nullable=True)
    _price_per_kwh = Column("price_per_kwh", Numeric(10, 2), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")

    # Relationships
    station = relationship("Station", back_populates="connectors")
    status_logs = relationship("StatusLog", back_populates="connector", cascade="all, delete-orphan")

    @property
    def max_power_kw(self):
        """Compatibility property for max_power_kw."""
        return self.power_kw

    @hybrid_property
    def price_per_kwh(self):
        """Retrieve connector price, or fallback to station price for legacy rows."""
        if self._price_per_kwh is not None:
            return self._price_per_kwh
        if self.station and self.station.price_per_kwh is not None:
            return self.station.price_per_kwh
        return 0.00

    @price_per_kwh.setter
    def price_per_kwh(self, value):
        self._price_per_kwh = value

    @price_per_kwh.expression
    def price_per_kwh(cls):
        return cls._price_per_kwh
