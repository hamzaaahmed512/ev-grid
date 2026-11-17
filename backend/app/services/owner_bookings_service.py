"""
VoltRelay - Owner Bookings Service (Part 3)
Read-side queries for owner bookings and upcoming reservations.
"""

from datetime import datetime, date, time, timezone
from typing import Optional, List, Dict, Any
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.station import Station
from app.models.connector import Connector
from app.models.booking import Booking
from app.models.user import User


def list_owner_bookings(
    db: Session,
    owner_id: int,
    station_id: Optional[int] = None,
    connector_id: Optional[int] = None,
    status_filter: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    page: int = 1,
    page_size: int = 20,
) -> Dict[str, Any]:
    """
    List bookings across stations owned by current user.
    Enforces isolation: another owner's stations cannot be accessed.
    """
    if station_id is not None:
        station = (
            db.query(Station)
            .filter(
                Station.id == station_id,
                Station.owner_id == owner_id,
                Station.is_active == True,
            )
            .first()
        )
        if not station:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Station not found",
            )

    if connector_id is not None:
        conn = (
            db.query(Connector)
            .join(Station, Connector.station_id == Station.id)
            .filter(
                Connector.id == connector_id,
                Station.owner_id == owner_id,
                Station.is_active == True,
            )
            .first()
        )
        if not conn:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Connector not found",
            )

    # Base query joined with Station, Connector, and User (driver)
    # Only select safe driver information (User.name), NEVER email or phone
    query = (
        db.query(
            Booking.id.label("booking_id"),
            Station.id.label("station_id"),
            Station.name.label("station_name"),
            Connector.id.label("connector_id"),
            Connector.label.label("connector_label"),
            Connector.connector_type.label("connector_type"),
            User.name.label("driver_name"),
            Booking.start_time.label("start_time"),
            Booking.end_time.label("end_time"),
            Booking.status.label("status"),
        )
        .select_from(Booking)
        .join(Station, Booking.station_id == Station.id)
        .join(Connector, Booking.connector_id == Connector.id)
        .join(User, Booking.user_id == User.id)
        .filter(
            Station.owner_id == owner_id,
            Station.is_active == True,
        )
    )

    if station_id is not None:
        query = query.filter(Booking.station_id == station_id)

    if connector_id is not None:
        query = query.filter(Booking.connector_id == connector_id)

    if status_filter:
        query = query.filter(func.upper(Booking.status) == status_filter.strip().upper())

    if date_from:
        start_dt = datetime.combine(date_from, time.min).replace(tzinfo=timezone.utc)
        query = query.filter(Booking.start_time >= start_dt)

    if date_to:
        end_dt = datetime.combine(date_to, time.max).replace(tzinfo=timezone.utc)
        query = query.filter(Booking.start_time <= end_dt)

    total = query.count()

    offset = (page - 1) * page_size
    rows = (
        query.order_by(Booking.start_time.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    items = []
    for r in rows:
        label = (
            r.connector_label
            if (r.connector_label and r.connector_label.strip())
            else f"{r.connector_type} #{r.connector_id}"
        )
        items.append({
            "booking_id": r.booking_id,
            "station_id": r.station_id,
            "station_name": r.station_name,
            "connector_id": r.connector_id,
            "connector_label": label,
            "driver_name": r.driver_name or "Unknown Driver",
            "start_time": r.start_time,
            "end_time": r.end_time,
            "status": r.status,
        })

    return {
        "bookings": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def list_upcoming_bookings(
    db: Session,
    owner_id: int,
    limit: int = 10,
) -> List[Dict[str, Any]]:
    """
    Get the next upcoming CONFIRMED bookings with start_time in the future, soonest first.
    """
    now_utc = datetime.now(timezone.utc)

    query = (
        db.query(
            Booking.id.label("booking_id"),
            Station.id.label("station_id"),
            Station.name.label("station_name"),
            Connector.id.label("connector_id"),
            Connector.label.label("connector_label"),
            Connector.connector_type.label("connector_type"),
            User.name.label("driver_name"),
            Booking.start_time.label("start_time"),
            Booking.end_time.label("end_time"),
            Booking.status.label("status"),
        )
        .select_from(Booking)
        .join(Station, Booking.station_id == Station.id)
        .join(Connector, Booking.connector_id == Connector.id)
        .join(User, Booking.user_id == User.id)
        .filter(
            Station.owner_id == owner_id,
            Station.is_active == True,
            func.upper(Booking.status) == "CONFIRMED",
            Booking.start_time > now_utc,
        )
        .order_by(Booking.start_time.asc())
        .limit(limit)
    )

    rows = query.all()
    items = []
    for r in rows:
        label = (
            r.connector_label
            if (r.connector_label and r.connector_label.strip())
            else f"{r.connector_type} #{r.connector_id}"
        )
        items.append({
            "booking_id": r.booking_id,
            "station_id": r.station_id,
            "station_name": r.station_name,
            "connector_id": r.connector_id,
            "connector_label": label,
            "driver_name": r.driver_name or "Unknown Driver",
            "start_time": r.start_time,
            "end_time": r.end_time,
            "status": r.status,
        })
    return items
