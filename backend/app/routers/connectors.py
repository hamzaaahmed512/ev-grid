"""
VoltRelay — Connectors Live Telemetry Router
Module 5, Part 3

Endpoints:
- GET /connectors/{id}/live   Public live telemetry and active session summary
"""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.connector import Connector
from app.models.charging_session import ChargingSession
from app.schemas.session import ConnectorLiveResponse, ActiveSessionSummary

router = APIRouter(prefix="/connectors", tags=["Connectors"])


@router.get("/{id}/live", response_model=ConnectorLiveResponse)
def get_connector_live_status(id: int, db: Session = Depends(get_db)):
    """
    Public endpoint returning real-time operational status, instantaneous power,
    last-seen timestamp, and active session summary for a connector.
    """
    connector = db.query(Connector).filter(Connector.id == id).first()
    if not connector:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Connector #{id} not found.",
        )

    # Lookup active session if present
    active_session = (
        db.query(ChargingSession)
        .filter(
            ChargingSession.connector_id == connector.id,
            ChargingSession.status == "ACTIVE",
        )
        .first()
    )

    session_summary = None
    if active_session:
        now = datetime.now(timezone.utc)
        started = active_session.started_at
        if started and started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        dur = int((now - started).total_seconds() / 60) if started else 0

        session_summary = ActiveSessionSummary(
            session_id=active_session.id,
            started_at=active_session.started_at,
            duration_minutes=dur,
            kwh_delivered=float(active_session.kwh_delivered or 0.0),
            current_power_kw=float(connector.current_power_kw or 0.0),
            soc=float(active_session.soc_end) if active_session.soc_end is not None else None,
            cost=float(active_session.cost or 0.0),
        )

    return {
        "connector_id": connector.id,
        "station_id": connector.station_id,
        "charger_id": connector.charger_id,
        "status": connector.status,
        "current_power_kw": float(connector.current_power_kw or 0.0),
        "last_seen": connector.last_seen,
        "active_session": session_summary,
    }
