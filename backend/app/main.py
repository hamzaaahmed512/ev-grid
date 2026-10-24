
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, vehicles, stations

# =============================================================================
# 1. Initialize FastAPI Application
# =============================================================================
app = FastAPI(
    title="VoltRelay API",
    description="EV Charging Management & Recommendation Platform API",
    version=getattr(settings, "VERSION", "1.0.0"),
)

# =============================================================================
# 2. Configure CORS (Cross-Origin Resource Sharing) Middleware
# Allows Next.js frontend (localhost:3000) to communicate with FastAPI
# =============================================================================
allowed_origins = getattr(
    settings, 
    "ALLOWED_ORIGINS", 
    ["http://localhost:3000", "https://voltrelay.vercel.app"]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =============================================================================
# 3. Mount Modular Application Routers
# =============================================================================
app.include_router(auth.router)
app.include_router(vehicles.router)
app.include_router(stations.router)

# =============================================================================
# 4. Core System Endpoints
# =============================================================================
@app.get("/", tags=["Core"])
def home():
    """Root health and version endpoint."""
    return {
        "status": "success",
        "message": "VoltRelay API is running",
        "version": getattr(settings, "VERSION", "1.0.0"),
    }


@app.get("/health", tags=["Core"])
def health_check():
    """Service status health check endpoint for monitoring."""
    return {
        "status": "ok",
        "project": getattr(settings, "PROJECT_NAME", "VoltRelay"),
    }