import os

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.station import Station
from app.routers import auth

# Initialize FastAPI app
app = FastAPI(
<<<<<<< HEAD
    title="EV Grid API",
    description="EV Charging Management & Recommendation Platform API",
    version="1.0.0"
=======
    title=settings.PROJECT_NAME,
    description="VoltRelay — EV Charging Management & Recommendation Platform API",
    version=settings.VERSION
>>>>>>> 374f0fe (Authentication added,.bat added, and env updated)
)

# CORS Middleware (Allows Next.js frontend to talk to FastAPI)
app.add_middleware(
    CORSMiddleware,
<<<<<<< HEAD
    allow_origins=[origin.strip() for origin in os.getenv(
        "CORS_ORIGINS", "http://localhost:3000,https://ev-grid-eta.vercel.app"
    ).split(",") if origin.strip()],
=======
    allow_origins=settings.ALLOWED_ORIGINS + ["*"],  # "*" allows all origins during development
>>>>>>> 374f0fe (Authentication added,.bat added, and env updated)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Routers
app.include_router(auth.router)

# ==========================================
# EXISTING CORE ENDPOINTS
# ==========================================

@app.get("/health")
def health_check():
<<<<<<< HEAD
    return {"status": "ok", "project": "EV Grid"}
=======
    """Health check endpoint to verify API server is running."""
    return {"status": "ok", "project": settings.PROJECT_NAME}
>>>>>>> 374f0fe (Authentication added,.bat added, and env updated)

@app.get("/stations")
def get_all_stations(db: Session = Depends(get_db)):
    """Fetch all charging stations from Supabase."""
    stations = db.query(Station).all()
    return stations

@app.get("/stations/{station_id}")
def get_station_by_id(station_id: int, db: Session = Depends(get_db)):
    """Fetch a single station by its ID."""
    station = db.query(Station).filter(Station.id == station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    return station
