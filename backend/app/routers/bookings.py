"""VoltRelay - Bookings Router
POST /bookings/              create a reservation
GET  /bookings/              list my bookings (?status=CONFIRMED|CANCELLED|COMPLETED)
GET  /bookings/{id}          one booking (owner only)
PUT  /bookings/{id}/cancel   cancel a future CONFIRMED booking
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.connector import Connector
from app.models.booking import Booking
from app.schemas.booking import BookingCreate, BookingResponse, BookingListResponse

router = APIRouter(prefix="/bookings", tags=["Bookings"])

VALID_STATUSES = {"CONFIRMED", "CANCELLED", "COMPLETED"}


def _utc(dt: datetime) -> datetime:
    """Ensure datetime is UTC-aware."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _to_response(b: Booking) -> dict:
    """Convert SQLAlchemy Booking model to response dictionary matching Pydantic schema."""
    duration = int((b.end_time - b.start_time).total_seconds() / 60)
    return {
        "id": b.id,
        "status": b.status,
        "start_time": b.start_time,
        "end_time": b.end_time,
        "duration_minutes": duration,
        "vehicle": {
            "id": b.vehicle.id,
            "name": b.vehicle.name,
            "connector_type": b.vehicle.connector_type,
        },
        "station": {
            "id": b.station.id,
            "name": b.station.name,
            "city": getattr(b.station, "city", None),
            "address": getattr(b.station, "address", None),
            "latitude": getattr(b.station, "latitude", None),
            "longitude": getattr(b.station, "longitude", None),
        },
        "connector": {
            "id": b.connector.id,
            "connector_type": b.connector.connector_type,
            "max_power_kw": b.connector.max_power_kw,
            "price_per_kwh": b.connector.price_per_kwh,
        },
        "created_at": b.created_at,
    }


def _expire_past_bookings(db: Session, user_id: int):
    """Auto-mark past CONFIRMED bookings as COMPLETED."""
    now_dt = _now()
    past_confs = db.query(Booking).filter(
        Booking.user_id == user_id,
        Booking.status == "CONFIRMED",
        Booking.end_time < now_dt
    ).all()
    for b in past_confs:
        b.status = "COMPLETED"
    if past_confs:
        db.commit()


@router.post("/", response_model=BookingResponse, status_code=status.HTTP_201_CREATED)
def create_booking(
    data: BookingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 1. Ownership check: Ensure vehicle belongs to current user
    vehicle = db.query(Vehicle).filter(
        Vehicle.id == data.vehicle_id,
        Vehicle.user_id == current_user.id
    ).first()
    if not vehicle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vehicle not found in your garage")

    # 2. Connector check: Ensure connector exists
    connector = db.query(Connector).filter(Connector.id == data.connector_id).first()
    if not connector:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Connector not found")

    # 3. Compatibility check: Ensure vehicle connector matches station connector
    if connector.connector_type.strip().lower() != vehicle.connector_type.strip().lower():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Connector type mismatch")

    # 4. Future time check: Start time must be in the future
    start = _utc(data.start_time)
    if start <= _now():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "start_time must be in future")
    
    end = start + timedelta(minutes=data.duration_minutes)

    # 5. Overlap check: Ensure no other CONFIRMED booking clashes with this time slot
    clash = db.query(Booking).filter(
        Booking.connector_id == connector.id,
        Booking.status == "CONFIRMED",
        Booking.start_time < end,
        Booking.end_time > start
    ).first()
    if clash:
        raise HTTPException(status.HTTP_409_CONFLICT, "Connector is already booked for this time slot")

    # Create new booking instance
    booking = Booking(
        user_id=current_user.id,
        vehicle_id=vehicle.id,
        station_id=connector.station_id,
        connector_id=connector.id,
        start_time=start,
        end_time=end,
        status="CONFIRMED"
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)

    return _to_response(booking)


@router.get("/", response_model=BookingListResponse)
def list_bookings(
    status: Optional[str] = Query(None, description="Filter by status: CONFIRMED, CANCELLED, COMPLETED"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    _expire_past_bookings(db, current_user.id)
    
    query = db.query(Booking).filter(Booking.user_id == current_user.id)
    if status:
        st_upper = status.upper()
        if st_upper not in VALID_STATUSES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid status. Choose from {VALID_STATUSES}")
        query = query.filter(Booking.status == st_upper)
        
    bookings = query.order_by(Booking.start_time.desc()).all()
    return {
        "count": len(bookings),
        "bookings": [_to_response(b) for b in bookings]
    }


def _get_owned_booking(db: Session, booking_id: int, user_id: int) -> Booking:
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    if booking.user_id != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found") # 404 security practice
    return booking


@router.get("/{booking_id}", response_model=BookingResponse)
def get_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    _expire_past_bookings(db, current_user.id)
    booking = _get_owned_booking(db, booking_id, current_user.id)
    return _to_response(booking)


@router.put("/{booking_id}/cancel", response_model=BookingResponse)
def cancel_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    booking = _get_owned_booking(db, booking_id, current_user.id)
    
    if booking.status == "CANCELLED":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Booking is already cancelled")
    if booking.status == "COMPLETED":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot cancel a completed booking")
    if _utc(booking.start_time) <= _now():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot cancel a booking that has already started or passed")
        
    booking.status = "CANCELLED"
    db.commit()
    db.refresh(booking)
    return _to_response(booking)