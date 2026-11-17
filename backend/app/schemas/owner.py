"""
VoltRelay - Owner Module Pydantic Schemas (Part 2)
"""

from datetime import datetime, date, time
from typing import List, Optional, Dict
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# Allowed connector types across the platform
VALID_CONNECTOR_MAP = {
    "CCS2": "CCS2",
    "CCS1": "CCS1",
    "TYPE 2": "Type 2",
    "TYPE2": "Type 2",
    "TYPE 1": "Type 1",
    "TYPE1": "Type 1",
    "CHADEMO": "CHAdeMO",
    "GB/T": "GB/T",
    "GBT": "GB/T",
    "TESLA": "Tesla",
    "SOCKET": "Socket",
}


def normalize_connector_type(v: str) -> str:
    cleaned = v.strip().upper()
    if cleaned in VALID_CONNECTOR_MAP:
        return VALID_CONNECTOR_MAP[cleaned]
    valid_list = "CCS2, CCS1, Type 2, Type 1, CHAdeMO, GB/T, Tesla, Socket"
    raise ValueError(f"Invalid connector_type. Must be one of: {valid_list}")


def determine_charging_type(connector_type: str) -> str:
    norm = connector_type.strip().upper()
    if norm in ("TYPE 2", "TYPE2", "TYPE 1", "TYPE1", "SOCKET"):
        return "AC"
    return "DC"


# ─── STATION SCHEMAS ──────────────────────────────────────────────────────────

class StationCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., min_length=3, max_length=100, description="Station name (3-100 characters)")
    address: Optional[str] = Field(default=None, max_length=500)
    city: Optional[str] = Field(default=None, max_length=50)
    latitude: float = Field(..., ge=-90.0, le=90.0, description="Latitude between -90 and 90")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="Longitude between -180 and 180")
    open_time: Optional[time] = Field(default=None, description="Opening time (e.g. 08:00)")
    close_time: Optional[time] = Field(default=None, description="Closing time (e.g. 22:00)")
    price_per_kwh: Optional[float] = Field(default=None, ge=0.0, le=1000.0, description="Price per kWh (0-1000)")

    @model_validator(mode="after")
    def validate_operating_hours(self):
        if self.open_time is not None and self.close_time is not None:
            if self.open_time >= self.close_time:
                raise ValueError("open_time must be earlier than close_time")
        return self


class StationUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., min_length=3, max_length=100)
    address: Optional[str] = Field(default=None, max_length=500)
    city: Optional[str] = Field(default=None, max_length=50)
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    open_time: Optional[time] = Field(default=None)
    close_time: Optional[time] = Field(default=None)
    price_per_kwh: Optional[float] = Field(default=None, ge=0.0, le=1000.0)

    @model_validator(mode="after")
    def validate_operating_hours(self):
        if self.open_time is not None and self.close_time is not None:
            if self.open_time >= self.close_time:
                raise ValueError("open_time must be earlier than close_time")
        return self


# ─── CONNECTOR SCHEMAS ────────────────────────────────────────────────────────

class ConnectorCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    label: Optional[str] = Field(default=None, max_length=50, description="e.g. Bay 1")
    connector_type: str = Field(..., min_length=1, max_length=50)
    power_kw: float = Field(..., ge=1.0, le=400.0, description="Power in kW (1-400)")
    price_per_kwh: Optional[float] = Field(default=None, ge=0.0, le=1000.0, description="Price per kWh (0-1000)")

    @field_validator("connector_type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        return normalize_connector_type(v)


class ConnectorUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    label: Optional[str] = Field(default=None, max_length=50)
    connector_type: str = Field(..., min_length=1, max_length=50)
    power_kw: float = Field(..., ge=1.0, le=400.0)
    price_per_kwh: Optional[float] = Field(default=None, ge=0.0, le=1000.0)

    @field_validator("connector_type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        return normalize_connector_type(v)


class ConnectorStatusPatch(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    status: str = Field(..., min_length=1, max_length=30)


# ─── RESPONSE SCHEMAS ─────────────────────────────────────────────────────────

class OwnerConnectorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    station_id: int
    label: Optional[str] = None
    connector_type: str
    power_kw: float
    charging_type: Optional[str] = None
    price_per_kwh: Optional[float] = None
    status: str
    last_seen: Optional[datetime] = None
    is_active: bool
    created_at: Optional[datetime] = None


class OwnerStationListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: Optional[int] = None
    name: str
    type: str
    city: Optional[str] = None
    address: Optional[str] = None
    latitude: float
    longitude: float
    open_time: Optional[time] = None
    close_time: Optional[time] = None
    rating: float
    status: str
    price_per_kwh: Optional[float] = None
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    connector_count: int


class OwnerStationListResponse(BaseModel):
    items: List[OwnerStationListItem]
    total: int
    page: int
    page_size: int


class OwnerStationDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: Optional[int] = None
    name: str
    type: str
    city: Optional[str] = None
    address: Optional[str] = None
    latitude: float
    longitude: float
    open_time: Optional[time] = None
    close_time: Optional[time] = None
    rating: float
    status: str
    price_per_kwh: Optional[float] = None
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    connectors: List[OwnerConnectorResponse]


class OwnerStatusLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    point_id: int
    old_status: Optional[str] = None
    new_status: str
    changed_at: datetime
    changed_by_user_id: Optional[int] = None


# ─── PART 3: READ-SIDE SCHEMAS (BOOKINGS, EARNINGS, DASHBOARD) ───────────────

class OwnerBookingItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    booking_id: int
    station_id: int
    station_name: str
    connector_id: int
    connector_label: str
    driver_name: str
    start_time: datetime
    end_time: datetime
    status: str


class OwnerBookingListResponse(BaseModel):
    bookings: List[OwnerBookingItem]
    total: int
    page: int
    page_size: int


class EarningsTotals(BaseModel):
    estimated_revenue: float
    estimated_energy_kwh: float
    completed_bookings: int


class EarningsTimeSeriesPoint(BaseModel):
    date: str
    period: Optional[str] = None
    estimated_revenue: float
    estimated_energy_kwh: float
    completed_bookings: int


class StationEarningsBreakdown(BaseModel):
    station_id: int
    station_name: str
    estimated_revenue: float
    estimated_energy_kwh: float
    completed_bookings: int


class OwnerEarningsResponse(BaseModel):
    estimated_revenue: float
    estimated_energy_kwh: float
    completed_bookings: int
    totals: EarningsTotals
    time_series: List[EarningsTimeSeriesPoint]
    station_breakdown: List[StationEarningsBreakdown]


class StationUtilization(BaseModel):
    station_id: int
    station_name: str
    utilization_percent: float
    booked_hours: float
    open_hours: float


class OwnerDashboardResponse(BaseModel):
    total_stations: int
    total_connectors: int
    connectors_by_status: Dict[str, int]
    today_bookings_count: int
    upcoming_bookings: List[OwnerBookingItem]
    estimated_revenue_this_month: float
    estimated_revenue_last_month: float
    utilization_last_7_days: List[StationUtilization]
