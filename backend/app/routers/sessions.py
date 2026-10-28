"""
VoltRelay — Charging Sessions Router
Module 5, Part 3

Endpoints:
- GET  /sessions/me        User charging session history
- GET  /sessions/{id}      Single charging session detail (owner only)
- POST /sessions/{id}/stop Remote stop command dispatch via TCP Gateway
"""

from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.connector import Connector
from app.models.charging_session import ChargingSession
from app.models.booking import Booking
from app.gateway.registry import charger_registry
from app.gateway.protocol import build_remote_stop
from app.schemas.session import (
    ChargingSessionResponse,
    ChargingSessionListResponse,
    SessionStopResponse,
)

router = APIRouter(prefix="/sessions", tags=["Sessions"])


def _to_session_response(s: ChargingSession) -> dict:
    """Format a ChargingSession ORM instance into response schema dictionary."""
    now = datetime.now(timezone.utc)
    started = s.started_at
    if started and started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)

    ended = s.ended_at
    if ended and ended.tzinfo is None:
        ended = ended.replace(tzinfo=timezone.utc)

    end_ref = ended or now
    duration = int((end_ref - started).total_seconds() / 60) if started else 0

    station_name = None
    connector_type = None
    if s.connector:
        connector_type = s.connector.connector_type
        if s.connector.station:
            station_name = s.connector.station.name

    return {
        "id": s.id,
        "connector_id": s.connector_id,
        "booking_id": s.booking_id,
        "user_id": s.user_id,
        "status": s.status,
        "started_at": s.started_at,
        "ended_at": s.ended_at,
        "duration_minutes": duration,
        "soc_start": float(s.soc_start) if s.soc_start is not None else None,
        "soc_end": float(s.soc_end) if s.soc_end is not None else None,
        "kwh_delivered": float(s.kwh_delivered or 0.0),
        "peak_power_kw": float(s.peak_power_kw or 0.0),
        "cost": float(s.cost or 0.0),
        "stop_reason": s.stop_reason,
        "station_name": station_name,
        "connector_type": connector_type,
    }


def _verify_session_ownership(session: ChargingSession, user_id: int) -> bool:
    """Verify whether session belongs to the given user ID directly or via linked booking."""
    if session.user_id == user_id:
        return True
    if session.booking and session.booking.user_id == user_id:
        return True
    return False


@router.get("/me", response_model=ChargingSessionListResponse)
def get_my_sessions(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retrieve charging session history for the authenticated user.
    Includes both direct sessions and reservation-linked sessions.
    """
    # Join with booking to check user_id on either charging_sessions or bookings
    query = (
        db.query(ChargingSession)
        .outerjoin(Booking, ChargingSession.booking_id == Booking.id)
        .filter(
            (ChargingSession.user_id == current_user.id) | (Booking.user_id == current_user.id)
        )
        .order_by(ChargingSession.started_at.desc())
    )

    total_count = query.count()
    sessions = query.offset(skip).limit(limit).all()

    return {
        "count": total_count,
        "sessions": [_to_session_response(s) for s in sessions],
    }


@router.get("/{id}", response_model=ChargingSessionResponse)
def get_session_by_id(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retrieve details for a single charging session.
    Owner-only authorization enforced.
    """
    session = db.query(ChargingSession).filter(ChargingSession.id == id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Charging session #{id} not found.",
        )

    if not _verify_session_ownership(session, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view this charging session.",
        )

    return _to_session_response(session)


@router.post("/{id}/stop", response_model=SessionStopResponse)
async def request_remote_stop(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Request a remote stop for an active charging session through the TCP Live Gateway.
    Fails if session is not active or target charger is disconnected.
    """
    session = db.query(ChargingSession).filter(ChargingSession.id == id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Charging session #{id} not found.",
        )

    if not _verify_session_ownership(session, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to control this charging session.",
        )

    if session.status != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot stop session #{id} with status '{session.status}'. Only ACTIVE sessions can be stopped.",
        )

    connector = db.query(Connector).filter(Connector.id == session.connector_id).first()
    if not connector or not connector.charger_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session connector is not configured with a valid charger hardware identifier.",
        )

    charger_id = connector.charger_id
    writer = await charger_registry.get_writer(charger_id)

    if not writer or writer.is_closing():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Charger '{charger_id}' is currently offline; remote stop could not be delivered.",
        )

    # Dispatch REMOTE_STOP frame over TCP
    try:
        cmd_frame = build_remote_stop(
            charger_id=charger_id,
            session_id=session.id,
            reason="USER_APP_REQUEST",
        )
        writer.write(cmd_frame.encode("utf-8"))
        await writer.drain()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed communicating stop command to charger socket: {exc}",
        )

    return {
        "ok": True,
        "session_id": session.id,
        "message": f"Remote stop command successfully sent to charger '{charger_id}'.",
    }
