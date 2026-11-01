from sqlalchemy import Column, Integer, String, Numeric, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    
    # Core Specifications
    make = Column(String(50), nullable=False)
    model = Column(String(50), nullable=False)
    year = Column(Integer, nullable=False)
    connector_type = Column(String(20), nullable=False)
    battery_capacity_kwh = Column(Numeric(5, 2), nullable=False)
    max_power_kw = Column(Numeric(5, 1), nullable=True, default=50.0)

    # User Profile / Garage Specifics (Phase 1)
    nickname = Column(String(50), nullable=True)
    range_km = Column(Integer, nullable=True)
    color = Column(String(30), nullable=True)
    license_plate = Column(String(20), nullable=True)
    is_primary = Column(Boolean, nullable=False, default=False)

    # Timestamps
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    user = relationship("User", back_populates="vehicles")