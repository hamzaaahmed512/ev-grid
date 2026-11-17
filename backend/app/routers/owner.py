"""
VoltRelay - Owner API Router (Part 2)
REST API endpoints for Station Business Owners.
"""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import require_business_owner
from app.models.user import User
from app.schemas.owner import (
    StationCreate,
    StationUpdate,
    ConnectorCreate,
    ConnectorUpdate,
    ConnectorStatusPatch,
    OwnerStationListResponse,
    OwnerStationDetailResponse,
    OwnerConnectorResponse,
)
from app.services import owner_service

router = APIRouter(prefix="/owner", tags=["Owner"])


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 1. STATION MANAGEMENT
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/stations",
    response_model=OwnerStationListResponse,
    summary="List own stations with connector counts",
)
def list_stations(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(10, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_business_owner),
):
    return owner_service.list_owner_stations(
        db=db,
        owner_id=current_user.id,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/stations",
    response_model=OwnerStationDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new station (type forced to B2P)",
)
def create_station(
    payload: StationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_business_owner),
):
    return owner_service.create_owner_station(
        db=db,
        owner_id=current_user.id,
        payload=payload,
    )


@router.get(
    "/stations/{id}",
    response_model=OwnerStationDetailResponse,
    summary="Get single station with active connectors",
)
def get_station(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_business_owner),
):
    return owner_service.get_owner_station(
        db=db,
        owner_id=current_user.id,
        station_id=id,
    )


@router.put(
    "/stations/{id}",
    response_model=OwnerStationDetailResponse,
    summary="Update station details",
)
def update_station(
    id: int,
    payload: StationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_business_owner),
):
    return owner_service.update_owner_station(
        db=db,
        owner_id=current_user.id,
        station_id=id,
        payload=payload,
    )


@router.delete(
    "/stations/{id}",
    summary="Soft delete station",
)
def delete_station(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_business_owner),
):
    return owner_service.delete_owner_station(
        db=db,
        owner_id=current_user.id,
        station_id=id,
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 2. CONNECTOR MANAGEMENT
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/stations/{id}/connectors",
    response_model=OwnerConnectorResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a charging connector to station",
)
def add_connector(
    id: int,
    payload: ConnectorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_business_owner),
):
    return owner_service.add_connector_to_station(
        db=db,
        owner_id=current_user.id,
        station_id=id,
        payload=payload,
    )


@router.put(
    "/connectors/{id}",
    response_model=OwnerConnectorResponse,
    summary="Update connector details",
)
def update_connector(
    id: int,
    payload: ConnectorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_business_owner),
):
    return owner_service.update_owner_connector(
        db=db,
        owner_id=current_user.id,
        connector_id=id,
        payload=payload,
    )


@router.patch(
    "/connectors/{id}/status",
    response_model=OwnerConnectorResponse,
    summary="Update connector status (AVAILABLE, OFFLINE, or DISABLED)",
)
def patch_connector_status(
    id: int,
    payload: ConnectorStatusPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_business_owner),
):
    return owner_service.patch_owner_connector_status(
        db=db,
        owner_id=current_user.id,
        connector_id=id,
        new_status_raw=payload.status,
    )


@router.delete(
    "/connectors/{id}",
    summary="Soft delete connector",
)
def delete_connector(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_business_owner),
):
    return owner_service.delete_owner_connector(
        db=db,
        owner_id=current_user.id,
        connector_id=id,
    )
