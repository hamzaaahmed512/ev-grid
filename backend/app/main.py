import os

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.station import Station

# ⭐ YEH LINE ZAROORI HAI: Uvicorn 'app.main:app' mein is 'app' ko dhoondhta hai
app = FastAPI(
    title="EV Grid API",
    description="EV Charging Management & Recommendation Platform API",
    version="1.0.0"
)

# CORS Middleware (Frontend communication ke liye)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv(
        "CORS_ORIGINS", "http://localhost:3000,https://ev-grid-eta.vercel.app"
    ).split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. Health Endpoint
@app.get("/health")
def health_check():
    return {"status": "ok", "project": "EV Grid"}

# 2. Get All Stations (Supabase Data)
@app.get("/stations")
def get_all_stations(db: Session = Depends(get_db)):
    stations = db.query(Station).all()
    return stations

# 3. Get Station By ID
@app.get("/stations/{station_id}")
def get_station_by_id(station_id: int, db: Session = Depends(get_db)):
    station = db.query(Station).filter(Station.id == station_id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    return station
