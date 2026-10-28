"""
VoltRelay — Charging Session Pydantic Schemas
Module 5
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class ChargingSessionResponse(BaseModel):
    id: int
    connector_id: int
    booking_id: Optional[int] = None
    user_id: Optional[int] = None
    status: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    soc_start: Optional[float] = None
    soc_end: Optional[float] = None
    kwh_delivered: float = Field(0.0)
    peak_power_kw: float = Field(0.0)
    cost: float = Field(0.0)
    stop_reason: Optional[str] = None
    station_name: Optional[str] = None
    connector_type: Optional[str] = None

    model_config = {"from_attributes": True}


class ChargingSessionListResponse(BaseModel):
    count: int
    sessions: List[ChargingSessionResponse]


class ActiveSessionSummary(BaseModel):
    session_id: int
    started_at: datetime
    duration_minutes: int
    kwh_delivered: float
    current_power_kw: float
    soc: Optional[float] = None
    cost: float


class ConnectorLiveResponse(BaseModel):
    connector_id: int
    station_id: int
    charger_id: Optional[str] = None
    status: str
    current_power_kw: float
    last_seen: Optional[datetime] = None
    active_session: Optional[ActiveSessionSummary] = None


class SessionStopResponse(BaseModel):
    ok: bool
    session_id: int
    message: str
