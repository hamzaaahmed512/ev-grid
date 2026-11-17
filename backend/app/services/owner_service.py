"""
VoltRelay - Owner Service (Business Logic)
Handles station and connector management for Business Owners.
"""

from datetime import datetime, timezone
from typing import Dict, List, Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.models.station import Station
from app.models.connector import Connector
from app.models.status_log import StatusLog
from app.models.booking import Booking
from app.schemas.owner import (
    StationCreate,
    StationUpdate,
    ConnectorCreate,
    ConnectorUpdate,
    OwnerStationListItem,
    OwnerStationListResponse,
    OwnerStationDetailResponse,
    OwnerConnectorResponse,
    determine_charging_type,
)

ALLOWED_OWNER_STATUSES = {"AVAILABLE", "OFFLINE", "DISABLED"}


def _serialize_connector(c: Connector) -> OwnerConnectorResponse:
    return OwnerConnectorResponse(
        id=c.id,
        station_id=c.station_id,
        label=c.label,
        connector_type=c.connector_type,
        power_kw=float(c.power_kw) if c.power_kw is not None else 0.0,
        charging_type=c.charging_type,
        price_per_kwh=float(c.price_per_kwh) if c.price_per_kwh is not None else None,
        status=c.status,
        last_seen=c.last_seen,
        is_active=c.is_active,
        created_at=c.created_at,
    )


def _serialize_station_detail(s: Station) -> OwnerStationDetailResponse:
    active_connectors = [
        _serialize_connector(c)
        for c in (s.connectors or [])
        if getattr(c, "is_active", True)
    ]
    return OwnerStationDetailResponse(
        id=s.id,
        owner_id=s.owner_id,
        name=s.name,
        type=s.type or "B2P",
        city=s.city,
        address=s.address,
        latitude=float(s.latitude),
        longitude=float(s.longitude),
        open_time=s.open_time,
        close_time=s.close_time,
        rating=float(s.rating) if s.rating is not None else 0.0,
        status=s.status or "AVAILABLE",
        price_per_kwh=float(s.price_per_kwh) if s.price_per_kwh is not None else None,
        is_active=s.is_active,
        created_at=s.created_at,
        updated_at=s.updated_at,
        connectors=active_connectors,
    )


def list_owner_stations(
    db: Session,
    owner_id: int,
    page: int = 1,
    page_size: int = 10,
) -> OwnerStationListResponse:
    """Lists all active stations owned by the authenticated business owner."""
    query = (
        db.query(Station)
        .options(joinedload(Station.connectors))
        .filter(
            Station.owner_id == owner_id,
            Station.is_active == True,
        )
    )

    total = query.count()
    stations = (
        query.order_by(Station.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    items = []
    for s in stations:
        active_conn_count = sum(1 for c in (s.connectors or []) if getattr(c, "is_active", True))
        items.append(
            OwnerStationListItem(
                id=s.id,
                owner_id=s.owner_id,
                name=s.name,
                type=s.type or "B2P",
                city=s.city,
                address=s.address,
                latitude=float(s.latitude),
                longitude=float(s.longitude),
                open_time=s.open_time,
                close_time=s.close_time,
                rating=float(s.rating) if s.rating is not None else 0.0,
                status=s.status or "AVAILABLE",
                price_per_kwh=float(s.price_per_kwh) if s.price_per_kwh is not None else None,
                is_active=s.is_active,
                created_at=s.created_at,
                updated_at=s.updated_at,
                connector_count=active_conn_count,
            )
        )

    return OwnerStationListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


def create_owner_station(
    db: Session,
    owner_id: int,
    payload: StationCreate,
) -> OwnerStationDetailResponse:
    """Creates a new B2P station for the business owner."""
    station = Station(
        owner_id=owner_id,
        type="B2P",
        name=payload.name,
        address=payload.address,
        city=payload.city,
        latitude=payload.latitude,
        longitude=payload.longitude,
        open_time=payload.open_time,
        close_time=payload.close_time,
        price_per_kwh=payload.price_per_kwh,
        status="AVAILABLE",
        rating=0.00,
        is_active=True,
    )
    db.add(station)
    db.commit()
    db.refresh(station)
    return _serialize_station_detail(station)


def get_owner_station(
    db: Session,
    owner_id: int,
    station_id: int,
) -> OwnerStationDetailResponse:
    """Retrieves an active station by ID, ensuring it belongs to the owner."""
    station = (
        db.query(Station)
        .options(joinedload(Station.connectors))
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
            detail=f"Station with ID {station_id} not found.",
        )
    return _serialize_station_detail(station)


def update_owner_station(
    db: Session,
    owner_id: int,
    station_id: int,
    payload: StationUpdate,
) -> OwnerStationDetailResponse:
    """Updates station details and sets updated_at timestamp."""
    station = (
        db.query(Station)
        .options(joinedload(Station.connectors))
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
            detail=f"Station with ID {station_id} not found.",
        )

    station.name = payload.name
    station.address = payload.address
    station.city = payload.city
    station.latitude = payload.latitude
    station.longitude = payload.longitude
    station.open_time = payload.open_time
    station.close_time = payload.close_time
    station.price_per_kwh = payload.price_per_kwh
    station.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(station)
    return _serialize_station_detail(station)


def delete_owner_station(
    db: Session,
    owner_id: int,
    station_id: int,
) -> Dict[str, str]:
    """Soft deletes a station (is_active = False) if no future confirmed bookings exist."""
    station = (
        db.query(Station)
        .options(joinedload(Station.connectors))
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
            detail=f"Station with ID {station_id} not found.",
        )

    # Check future confirmed bookings
    now_utc = datetime.now(timezone.utc)
    future_booking = (
        db.query(Booking)
        .filter(
            Booking.station_id == station_id,
            Booking.status == "CONFIRMED",
            Booking.end_time > now_utc,
        )
        .first()
    )
    if future_booking:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot deactivate station with active or future confirmed bookings.",
        )

    station.is_active = False
    station.updated_at = datetime.now(timezone.utc)

    # Also soft delete associated connectors
    for c in station.connectors or []:
        c.is_active = False

    db.commit()
    return {"message": "Station deactivated successfully", "id": str(station_id)}


def add_connector_to_station(
    db: Session,
    owner_id: int,
    station_id: int,
    payload: ConnectorCreate,
) -> OwnerConnectorResponse:
    """Adds a connector to a station, enforcing P2P <= 1 and B2P <= 6 limits."""
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
            detail=f"Station with ID {station_id} not found.",
        )

    # Count active connectors
    active_count = (
        db.query(Connector)
        .filter(
            Connector.station_id == station_id,
            Connector.is_active == True,
        )
        .count()
    )

    st_type = (station.type or "B2P").strip().upper()
    if st_type == "P2P" and active_count >= 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="P2P stations can have at most 1 charging point.",
        )
    if st_type == "B2P" and active_count >= 6:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="B2P stations can have at most 6 charging points.",
        )

    charging_type = determine_charging_type(payload.connector_type)
    price = payload.price_per_kwh if payload.price_per_kwh is not None else station.price_per_kwh

    connector = Connector(
        station_id=station_id,
        label=payload.label,
        connector_type=payload.connector_type,
        power_kw=payload.power_kw,
        price_per_kwh=price,
        charging_type=charging_type,
        status="AVAILABLE",
        is_active=True,
    )
    db.add(connector)
    db.commit()
    db.refresh(connector)
    return _serialize_connector(connector)


def update_owner_connector(
    db: Session,
    owner_id: int,
    connector_id: int,
    payload: ConnectorUpdate,
) -> OwnerConnectorResponse:
    """Updates connector details, ensuring it belongs to the owner's active station."""
    connector = (
        db.query(Connector)
        .join(Station, Connector.station_id == Station.id)
        .filter(
            Connector.id == connector_id,
            Station.owner_id == owner_id,
            Connector.is_active == True,
            Station.is_active == True,
        )
        .first()
    )
    if not connector:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Connector with ID {connector_id} not found.",
        )

    connector.label = payload.label
    connector.connector_type = payload.connector_type
    connector.power_kw = payload.power_kw
    connector.charging_type = determine_charging_type(payload.connector_type)
    connector.price_per_kwh = payload.price_per_kwh

    db.commit()
    db.refresh(connector)
    return _serialize_connector(connector)


def patch_owner_connector_status(
    db: Session,
    owner_id: int,
    connector_id: int,
    new_status_raw: str,
) -> OwnerConnectorResponse:
    """Owner updates connector status to AVAILABLE, OFFLINE, or DISABLED."""
    normalized_status = new_status_raw.strip().upper()
    if normalized_status not in ALLOWED_OWNER_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Owner may only set status to AVAILABLE, OFFLINE, or DISABLED.",
        )

    connector = (
        db.query(Connector)
        .join(Station, Connector.station_id == Station.id)
        .filter(
            Connector.id == connector_id,
            Station.owner_id == owner_id,
            Connector.is_active == True,
            Station.is_active == True,
        )
        .first()
    )
    if not connector:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Connector with ID {connector_id} not found.",
        )

    old_status = connector.status
    now_utc = datetime.now(timezone.utc)

    # Record status change log
    status_log = StatusLog(
        point_id=connector.id,
        old_status=old_status,
        new_status=normalized_status,
        changed_at=now_utc,
        changed_by_user_id=owner_id,
    )
    db.add(status_log)

    connector.status = normalized_status
    connector.last_seen = now_utc

    db.commit()
    db.refresh(connector)
    return _serialize_connector(connector)


def delete_owner_connector(
    db: Session,
    owner_id: int,
    connector_id: int,
) -> Dict[str, str]:
    """Soft deletes a connector if no future confirmed bookings exist."""
    connector = (
        db.query(Connector)
        .join(Station, Connector.station_id == Station.id)
        .filter(
            Connector.id == connector_id,
            Station.owner_id == owner_id,
            Connector.is_active == True,
            Station.is_active == True,
        )
        .first()
    )
    if not connector:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Connector with ID {connector_id} not found.",
        )

    now_utc = datetime.now(timezone.utc)
    future_booking = (
        db.query(Booking)
        .filter(
            Booking.connector_id == connector_id,
            Booking.status == "CONFIRMED",
            Booking.end_time > now_utc,
        )
        .first()
    )
    if future_booking:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot deactivate connector with active or future confirmed bookings.",
        )

    connector.is_active = False
    db.commit()
    return {"message": "Connector deactivated successfully", "id": str(connector_id)}
