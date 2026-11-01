from typing import List, cast
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.vehicle import Vehicle
from app.schemas.vehicle import VehicleCreate, VehicleUpdate, VehicleResponse

# ⚠️ APNI AUTH FILE KE ACCORDING IMPORT ADJUST KARO:
# Agar get_current_user auth.py mein hai to: from app.routers.auth import get_current_user
# Agar core/security mein hai to check function name.
from app.core.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/vehicles", tags=["Vehicles"])


@router.get("/", response_model=List[VehicleResponse])
def get_user_vehicles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Current logged-in user ki saari vehicles fetch karta hai."""
    return db.query(Vehicle).filter(Vehicle.user_id == current_user.id).all()


@router.get("/primary", response_model=VehicleResponse)
def get_primary_vehicle(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """User ki primary vehicle return karta hai."""
    vehicle = (
        db.query(Vehicle)
        .filter(Vehicle.user_id == current_user.id, Vehicle.is_primary.is_(True))
        .first()
    )
    if not vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No primary vehicle set.",
        )
    return vehicle


@router.get("/{vehicle_id}", response_model=VehicleResponse)
def get_vehicle_by_id(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Specific vehicle details return karta hai."""
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found.",
        )
    if vehicle.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this vehicle.",
        )
    return vehicle


@router.post("/", response_model=VehicleResponse, status_code=status.HTTP_201_CREATED)
def create_vehicle(
    vehicle_in: VehicleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Nayi vehicle add karta hai. Pehli vehicle auto-primary set ho jati hai."""
    existing_count = db.query(Vehicle).filter(Vehicle.user_id == current_user.id).count()
    vehicle_data = vehicle_in.model_dump()

    if existing_count == 0:
        vehicle_data["is_primary"] = True
    elif bool(vehicle_data.get("is_primary")):
        db.query(Vehicle).filter(Vehicle.user_id == current_user.id).update({"is_primary": False})

    db_vehicle = Vehicle(**vehicle_data, user_id=current_user.id)
    db.add(db_vehicle)
    db.commit()
    db.refresh(db_vehicle)
    return db_vehicle


@router.patch("/{vehicle_id}", response_model=VehicleResponse)
def update_vehicle(
    vehicle_id: int,
    vehicle_in: VehicleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Vehicle details update karta hai."""
    db_vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not db_vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found.",
        )
    if db_vehicle.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this vehicle.",
        )

    update_data = vehicle_in.model_dump(exclude_unset=True)

    if bool(update_data.get("is_primary")):
        db.query(Vehicle).filter(Vehicle.user_id == current_user.id).update({"is_primary": False})

    for field, value in update_data.items():
        setattr(db_vehicle, field, value)

    db.commit()
    db.refresh(db_vehicle)
    return db_vehicle


@router.patch("/{vehicle_id}/set-primary", response_model=VehicleResponse)
def set_primary_vehicle(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Kisi vehicle ko primary set karta hai."""
    db_vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not db_vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found.",
        )
    if db_vehicle.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to modify this vehicle.",
        )

    db.query(Vehicle).filter(Vehicle.user_id == current_user.id).update({"is_primary": False})

    setattr(db_vehicle, "is_primary", True)
    db.commit()
    db.refresh(db_vehicle)
    return db_vehicle


@router.delete("/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vehicle(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Vehicle delete karta hai."""
    db_vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not db_vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found.",
        )
    if db_vehicle.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this vehicle.",
        )

    was_primary: bool = bool(db_vehicle.is_primary)
    db.delete(db_vehicle)
    db.commit()

    if was_primary:
        remaining_vehicle = (
            db.query(Vehicle).filter(Vehicle.user_id == current_user.id).first()
        )
        if remaining_vehicle:
            setattr(remaining_vehicle, "is_primary", True)
            db.commit()

    return None