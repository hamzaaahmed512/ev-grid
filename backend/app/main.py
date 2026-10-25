from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, vehicles, stations, bookings

# =============================================================================
# 1. Initialize FastAPI Application
# =============================================================================
app = FastAPI(
    title="VoltRelay API",
    description="EV Charging Management & Recommendation Platform API",
    version=getattr(settings, "VERSION", "1.0.0"),
)

# =============================================================================
# 2. Mount Modular Application Routers
# =============================================================================
app.include_router(auth.router)
app.include_router(vehicles.router)
app.include_router(stations.router)
app.include_router(bookings.router)

# =============================================================================
# 3. Core System Endpoints
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


# =============================================================================
# 4. Wrap with Outer CORS Middleware
# Wrapping the FastAPI stack ensures CORS headers are attached to all responses,
# including unhandled 500 server errors.
# =============================================================================
fastapi_app = app
app = CORSMiddleware(
    app=fastapi_app,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)