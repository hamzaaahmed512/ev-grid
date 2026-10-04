from sqlalchemy import Column, Integer, String, Float, Numeric, DateTime
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