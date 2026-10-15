from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.station import Station
from app.routers import auth

# Initialize FastAPI app
app = FastAPI(
    title=settings.PROJECT_NAME,
    description="VoltRelay — EV Charging Management & Recommendation Platform API",
    version=settings.VERSION
)

# ==========================================
# CORS Middleware
# NOTE: Cannot combine allow_credentials=True with allow_origins=["*"].
# Use explicit origins from settings instead.
# ==========================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Routers
app.include_router(auth.router)

# ==========================================
# CORE ENDPOINTS
# ==========================================

@app.get("/health")
def health_check():
    """Health check endpoint to verify API server is running."""
    return {"status": "ok", "project": settings.PROJECT_NAME}

@app.get("/stations")
def get_all_stations(
    city: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db)
):
    """
    Fetch all charging stations from Supabase.
    Supports optional ?city= and ?status= query filters.
    """
    query = db.query(Station)
    if city:
        query = query.filter(Station.city.ilike(f"%{city}%"))
    if status:
        query = query.filter(Station.status == status.upper())
    stations = query.all()
    return [
        {
            "id": s.id,
            "name": s.name,
            "city": s.city,
            "address": s.address,
            "latitude": float(s.latitude) if s.latitude is not None else None,
            "longitude": float(s.longitude) if s.longitude is not None else None,
            "status": s.status,
            "price_per_kwh": float(s.price_per_kwh) if s.price_per_kwh is not None else None,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in stations
    ]

@app.get("/stations/{station_id}")
def get_station_by_id(station_id: int, db: Session = Depends(get_db)):
    """Fetch a single station by its ID."""
    s = db.query(Station).filter(Station.id == station_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Station not found")
    return {
        "id": s.id,
        "name": s.name,
        "city": s.city,
        "address": s.address,
        "latitude": float(s.latitude) if s.latitude is not None else None,
        "longitude": float(s.longitude) if s.longitude is not None else None,
        "status": s.status,
        "price_per_kwh": float(s.price_per_kwh) if s.price_per_kwh is not None else None,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }