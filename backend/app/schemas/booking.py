"""VoltRelay - Booking Pydantic Schemas"""
from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field

BookingStatus = Literal["CONFIRMED", "CANCELLED", "COMPLETED"]

# ─── REQUEST ─────────────────────────────────────
class BookingCreate(BaseModel):
    vehicle_id: int = Field(..., examples=[1])
    connector_id: int = Field(..., examples=[7])
    start_time: datetime = Field(..., examples=["2026-03-01T10:00:00Z"])
    duration_minutes: int = Field(60, ge=15, le=240, examples=[60])

    model_config = {
        "json_schema_extra": {
            "example": {
                "vehicle_id": 1,
                "connector_id": 7,
                "start_time": "2026-03-01T10:00:00Z",
                "duration_minutes": 60,
            }
        }
    }

# ─── NESTED RESPONSE PARTS ───────────────────────
class BookingVehicle(BaseModel):
    id: int
    name: str
    connector_type: str

class BookingStation(BaseModel):
    id: int
    name: str
    city: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class BookingConnector(BaseModel):
    id: int
    connector_type: str
    max_power_kw: float
    price_per_kwh: float

# ─── RESPONSE ────────────────────────────────────
class BookingResponse(BaseModel):
    id: int
    status: BookingStatus
    start_time: datetime
    end_time: datetime
    duration_minutes: int
    vehicle: BookingVehicle
    station: BookingStation
    connector: BookingConnector
    created_at: Optional[datetime] = None

class BookingListResponse(BaseModel):
    count: int
    bookings: list[BookingResponse]