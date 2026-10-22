from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class VehicleBase(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    make: str = Field(..., min_length=1, max_length=50, description="Vehicle manufacturer")
    model: str = Field(..., min_length=1, max_length=50, description="Vehicle model")
    year: int = Field(..., ge=1990, le=2030, description="Manufacturing year between 1990 and 2030")
    battery_capacity_kwh: float = Field(..., gt=0.0, description="Battery capacity in kWh")
    connector_type: str = Field(..., description="Connector standard/type")


class VehicleCreate(VehicleBase):
    pass


class VehicleUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    make: Optional[str] = Field(default=None, min_length=1, max_length=50)
    model: Optional[str] = Field(default=None, min_length=1, max_length=50)
    year: Optional[int] = Field(default=None, ge=1990, le=2030)
    battery_capacity_kwh: Optional[float] = Field(default=None, gt=0.0, description="Battery capacity in kWh")
    connector_type: Optional[str] = Field(default=None)


class VehicleResponse(VehicleBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
