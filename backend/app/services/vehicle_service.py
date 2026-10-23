from datetime import datetime, timezone
from typing import Any, Dict, List
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.vehicle import Vehicle
from app.schemas.vehicle import VehicleCreate, VehicleUpdate

VALID_CONNECTORS = {"CCS1", "CCS2", "CHADEMO", "TYPE1", "TYPE2", "GB/T", "TESLA"}


def validate_and_normalize_connector(connector_type: str) -> str:
    """
    Validates and normalizes the EV connector type string.

    - Strips whitespace and converts input string to uppercase.
    - Validates against VALID_CONNECTORS.
    - Raises HTTPException(400) if invalid.
    - Returns the normalized connector string.
    """
    if not connector_type or not connector_type.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid connector type. Allowed values: CCS1, CCS2, CHAdeMO, Type1, Type2, GB/T, Tesla",
        )

    normalized = connector_type.strip().upper()

    if normalized not in VALID_CONNECTORS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid connector type. Allowed values: CCS1, CCS2, CHAdeMO, Type1, Type2, GB/T, Tesla",
        )

    return normalized


def create_vehicle(db: Session, vehicle_in: VehicleCreate, user_id: int) -> Vehicle:
    """
    Creates a new vehicle for the authenticated user after validating connector type.
    """
    normalized_connector = validate_and_normalize_connector(vehicle_in.connector_type)

    db_vehicle = Vehicle(
        user_id=user_id,
        make=vehicle_in.make,
        model=vehicle_in.model,
        year=vehicle_in.year,
        battery_capacity_kwh=vehicle_in.battery_capacity_kwh,
        connector_type=normalized_connector,
    )
    db.add(db_vehicle)
    db.commit()
    db.refresh(db_vehicle)
    return db_vehicle


def get_user_vehicles(db: Session, user_id: int) -> List[Vehicle]:
    """
    Fetches all vehicles owned by the authenticated user ordered by created_at descending.
    """
    return (
        db.query(Vehicle)
        .filter(Vehicle.user_id == user_id)
        .order_by(Vehicle.created_at.desc())
        .all()
    )


def get_vehicle_by_id_and_owner(db: Session, vehicle_id: int, user_id: int) -> Vehicle:
    """
    Fetches a vehicle by ID ensuring the requesting user is the owner.
    Raises HTTPException(404) if not found or if the vehicle does not belong to the user.
    """
    vehicle = (
        db.query(Vehicle)
        .filter(Vehicle.id == vehicle_id, Vehicle.user_id == user_id)
        .first()
    )
    if not vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found",
        )
    return vehicle


def update_vehicle(
    db: Session,
    vehicle_id: int,
    user_id: int,
    vehicle_in: VehicleUpdate,
) -> Vehicle:
    """
    Updates an existing vehicle owned by the user. Only updates explicitly provided fields.
    Validates connector_type if it is being updated.
    """
    vehicle = get_vehicle_by_id_and_owner(db=db, vehicle_id=vehicle_id, user_id=user_id)
    update_data = vehicle_in.model_dump(exclude_unset=True)

    if not update_data:
        return vehicle

    if "connector_type" in update_data and update_data["connector_type"] is not None:
        update_data["connector_type"] = validate_and_normalize_connector(update_data["connector_type"])

    for field, value in update_data.items():
        setattr(vehicle, field, value)

    vehicle.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(vehicle)
    return vehicle


def delete_vehicle(db: Session, vehicle_id: int, user_id: int) -> Dict[str, Any]:
    """
    Deletes a vehicle owned by the user. Raises 404 if not found or unauthorized.
    """
    vehicle = get_vehicle_by_id_and_owner(db=db, vehicle_id=vehicle_id, user_id=user_id)
    db.delete(vehicle)
    db.commit()
    return {"message": "Vehicle deleted successfully", "id": vehicle_id}
