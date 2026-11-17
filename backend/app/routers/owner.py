"""
VoltRelay - Owner API Router (Part 2)
REST API endpoints for Station Business Owners.
"""

from datetime import date, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
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
    OwnerBookingItem,
    OwnerBookingListResponse,
    OwnerEarningsResponse,
    OwnerDashboardResponse,
)
from app.services import owner_service, owner_bookings_service, owner_analytics_service

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


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 3. BOOKINGS MANAGEMENT (PART 3)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/bookings/upcoming",
    response_model=List[OwnerBookingItem],
    summary="Next 10 upcoming confirmed bookings",
)
def get_upcoming_bookings(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_business_owner),
):
    return owner_bookings_service.list_upcoming_bookings(
        db=db,
        owner_id=current_user.id,
        limit=10,
    )


@router.get(
    "/bookings",
    response_model=OwnerBookingListResponse,
    summary="List owner bookings with filters and pagination",
)
def list_bookings(
    station_id: Optional[int] = Query(None, description="Filter by station ID"),
    connector_id: Optional[int] = Query(None, description="Filter by connector ID"),
    booking_status: Optional[str] = Query(None, alias="status", description="Filter by status (CONFIRMED, CANCELLED, COMPLETED)"),
    date_from: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page (max 100)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_business_owner),
):
    if date_from and date_to:
        if date_from > date_to:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="date_from must be earlier than or equal to date_to",
            )
        if (date_to - date_from).days > 366:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Date range cannot exceed 366 days",
            )
    return owner_bookings_service.list_owner_bookings(
        db=db,
        owner_id=current_user.id,
        station_id=station_id,
        connector_id=connector_id,
        status_filter=booking_status,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size,
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 4. EARNINGS & DASHBOARD (PART 3)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/earnings",
    response_model=OwnerEarningsResponse,
    summary="Get estimated earnings totals, time series, and breakdown",
)
def get_earnings(
    date_from: Optional[date] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[date] = Query(None, description="End date (YYYY-MM-DD)"),
    group_by: str = Query("day", description="Grouping interval: 'day' or 'month'"),
    station_id: Optional[int] = Query(None, description="Optional station ID filter"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_business_owner),
):
    group_by_norm = (group_by or "").strip().lower()
    if group_by_norm not in ("day", "month"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="group_by must be either 'day' or 'month'",
        )

    if date_from and date_to:
        if date_from > date_to:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="date_from must be earlier than or equal to date_to",
            )
        if (date_to - date_from).days > 366:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Date range cannot exceed 366 days",
            )
    elif date_from and not date_to:
        date_to = date.today()
        if date_from > date_to:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="date_from must be earlier than or equal to date_to",
            )
        if (date_to - date_from).days > 366:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Date range cannot exceed 366 days",
            )
    elif not date_from and date_to:
        date_from = date_to - timedelta(days=30)
    else:
        date_to = date.today()
        date_from = date_to - timedelta(days=30)

    return owner_analytics_service.get_owner_earnings(
        db=db,
        owner_id=current_user.id,
        date_from=date_from,
        date_to=date_to,
        group_by=group_by_norm,
        station_id=station_id,
    )


@router.get(
    "/dashboard",
    response_model=OwnerDashboardResponse,
    summary="Get owner dashboard statistics",
)
def get_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_business_owner),
):
    return owner_analytics_service.get_owner_dashboard(
        db=db,
        owner_id=current_user.id,
    )

