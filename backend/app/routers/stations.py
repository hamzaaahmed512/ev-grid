"""
VoltRelay - Stations & Compatibility Router
"""

from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.station import Station
from app.models.connector import Connector

router = APIRouter(prefix="/stations", tags=["Stations"])


def serialize_connector(c: Any, station_price: Any = None) -> dict:
    """Helper to format database Connector object into clean JSON."""
    power = getattr(c, "power_kw", None)
    if power is None:
        power = getattr(c, "max_power_kw", 0.0)

    price = getattr(c, "price_per_kwh", None)
    if price is None:
        price = station_price

    return {
        "id": c.id,
        "connector_type": c.connector_type,
        "power_kw": float(power) if power is not None else 0.0,
        "max_power_kw": float(power) if power is not None else 0.0,
        "charging_type": getattr(c, "charging_type", None),
        "price_per_kwh": float(price) if price is not None else 0.0,
        "status": c.status,
    }


def serialize_station(s: Any, matching_connector_type: str | None = None) -> dict:
    """Helper function to format database Station object into JSON response."""
    lat = getattr(s, "latitude", None)
    lng = getattr(s, "longitude", None)
    price = getattr(s, "price_per_kwh", None)
    created = getattr(s, "created_at", None)

    iso_func = getattr(created, "isoformat", None)
    created_str = iso_func() if callable(iso_func) else (str(created) if created else None)

    # Format connectors
    connectors_list = []
    if hasattr(s, "connectors") and s.connectors:
        for c in s.connectors:
            connectors_list.append(serialize_connector(c, station_price=price))


    # Determine if compatible with requested filter
    is_compatible = True
    if matching_connector_type:
        is_compatible = any(
            c.get("connector_type", "").upper() == matching_connector_type.upper()
            for c in connectors_list
        )

    return {
        "id": s.id,
        "name": s.name,
        "city": s.city,
        "address": s.address,
        "latitude": float(lat) if lat is not None else None,
        "longitude": float(lng) if lng is not None else None,
        "status": s.status,
        "price_per_kwh": float(price) if price is not None else None,
        "is_compatible": is_compatible,
        "connectors": connectors_list,
        "created_at": created_str,
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 1. LIST ALL STATIONS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
@router.get(
    "/",
    summary="Fetch all charging stations",
    description="Fetch all 169 EV charging stations across Pakistan."
)
def get_all_stations(
    city: str | None = Query(None, description="Filter stations by city"),
    status_filter: str | None = Query(None, alias="status", description="Filter by status"),
    db: Session = Depends(get_db),
):
    query = db.query(Station).options(joinedload(Station.connectors))
    if city:
        query = query.filter(Station.city.ilike(f"%{city}%"))
    if status_filter:
        query = query.filter(Station.status == status_filter.upper())

    stations = query.all()
    return [serialize_station(s) for s in stations]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 2. GET COMPATIBLE STATIONS FOR VEHICLE
# (MUST BE PLACED BEFORE /{station_id})
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
@router.get(
    "/compatible",
    summary="Fetch stations compatible with user's vehicle",
    description="Returns only charging stations that have connectors matching the user's selected EV."
)
def get_compatible_stations(
    vehicle_id: int = Query(..., description="ID of the registered vehicle"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 1. Verify user owns the requested vehicle
    vehicle = (
        db.query(Vehicle)
        .filter(Vehicle.id == vehicle_id, Vehicle.user_id == current_user.id)
        .first()
    )

    if not vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehicle with ID {vehicle_id} not found in your garage"
        )

    target_connector = vehicle.connector_type.strip()

    # 2. Join Stations and Connectors to filter compatible stations
    compatible_stations = (
        db.query(Station)
        .options(joinedload(Station.connectors))
        .join(Connector, Station.id == Connector.station_id)
        .filter(Connector.connector_type.ilike(f"%{target_connector}%"))
        .distinct()
        .all()
    )

    return {
        "vehicle": {
            "id": vehicle.id,
            "name": f"{vehicle.make} {vehicle.model}",
            "year": vehicle.year,
            "connector_type": target_connector,
            "battery_capacity_kwh": float(vehicle.battery_capacity_kwh) if vehicle.battery_capacity_kwh else None,
            "battery_kwh": float(vehicle.battery_capacity_kwh) if vehicle.battery_capacity_kwh else None,
        },
        "total_compatible": len(compatible_stations),
        "stations": [serialize_station(s, matching_connector_type=target_connector) for s in compatible_stations],
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 3. GET SINGLE STATION BY ID
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
@router.get(
    "/{station_id}",
    summary="Fetch station by ID"
)
def get_station_by_id(station_id: int, db: Session = Depends(get_db)):
    s = (
        db.query(Station)
        .options(joinedload(Station.connectors))
        .filter(Station.id == station_id)
        .first()
    )
    if not s:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Station with ID {station_id} not found"
        )
    return serialize_station(s)