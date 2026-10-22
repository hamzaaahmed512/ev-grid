from typing import Any, Dict, List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.vehicle import VehicleCreate, VehicleUpdate, VehicleResponse
from app.services.vehicle_service import (
    create_vehicle,
    get_user_vehicles,
    get_vehicle_by_id_and_owner,
    update_vehicle,
    delete_vehicle,
)

router = APIRouter(prefix="/vehicles", tags=["Vehicles"])


@router.post("/", response_model=VehicleResponse, status_code=status.HTTP_201_CREATED)
def create_new_vehicle(
    vehicle_in: VehicleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Register a new vehicle under the authenticated user's account.
    """
    return create_vehicle(db=db, vehicle_in=vehicle_in, user_id=current_user.id)


@router.get("/", response_model=List[VehicleResponse], status_code=status.HTTP_200_OK)
def list_vehicles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Fetch all vehicles belonging to the authenticated user.
    """
    return get_user_vehicles(db=db, user_id=current_user.id)


@router.get("/{id}", response_model=VehicleResponse, status_code=status.HTTP_200_OK)
def get_vehicle(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieve details of a specific vehicle owned by the authenticated user.
    """
    return get_vehicle_by_id_and_owner(db=db, vehicle_id=id, user_id=current_user.id)


@router.put("/{id}", response_model=VehicleResponse, status_code=status.HTTP_200_OK)
def update_existing_vehicle(
    id: int,
    vehicle_in: VehicleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update attributes of an existing vehicle owned by the authenticated user.
    """
    return update_vehicle(
        db=db,
        vehicle_id=id,
        user_id=current_user.id,
        vehicle_in=vehicle_in,
    )


@router.delete("/{id}", status_code=status.HTTP_200_OK)
def remove_vehicle(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Delete a specific vehicle owned by the authenticated user.
    """
    return delete_vehicle(db=db, vehicle_id=id, user_id=current_user.id)
