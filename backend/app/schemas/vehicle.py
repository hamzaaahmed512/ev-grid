from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class VehicleBase(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    make: str = Field(..., min_length=1, max_length=50, description="Vehicle manufacturer")
    model: str = Field(..., min_length=1, max_length=50, description="Vehicle model")
    year: int = Field(..., ge=1990, le=2030, description="Manufacturing year between 1990 and 2030")
    battery_capacity_kwh: float = Field(..., gt=0.0, description="Battery capacity in kWh")
    connector_type: str = Field(..., min_length=1, max_length=20, description="Connector standard/type (e.g., CCS, Type 2)")
    max_power_kw: Optional[float] = Field(default=50.0, gt=0.0, description="Max charging power acceptance in kW")

    # User Profile / Garage Specifics (Phase 1)
    nickname: Optional[str] = Field(default=None, max_length=50, description="Custom vehicle nickname")
    range_km: Optional[int] = Field(default=None, gt=0, description="Estimated driving range in km")
    color: Optional[str] = Field(default=None, max_length=30, description="Vehicle exterior color")
    license_plate: Optional[str] = Field(default=None, max_length=20, description="Registration plate number")
    is_primary: bool = Field(default=False, description="Set as primary vehicle for recommendations")


class VehicleCreate(VehicleBase):
    pass


class VehicleUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    make: Optional[str] = Field(default=None, min_length=1, max_length=50)
    model: Optional[str] = Field(default=None, min_length=1, max_length=50)
    year: Optional[int] = Field(default=None, ge=1990, le=2030)
    battery_capacity_kwh: Optional[float] = Field(default=None, gt=0.0, description="Battery capacity in kWh")
    connector_type: Optional[str] = Field(default=None, min_length=1, max_length=20)
    max_power_kw: Optional[float] = Field(default=None, gt=0.0)
    nickname: Optional[str] = Field(default=None, max_length=50)
    range_km: Optional[int] = Field(default=None, gt=0)
    color: Optional[str] = Field(default=None, max_length=30)
    license_plate: Optional[str] = Field(default=None, max_length=20)
    is_primary: Optional[bool] = Field(default=None)


class VehicleResponse(VehicleBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)