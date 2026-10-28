"""
VoltRelay — WebSocket Real-Time Router
Exposes /ws/stations for live telemetry streaming.
"""

import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.realtime.manager import ws_manager

logger = logging.getLogger("realtime.router")
router = APIRouter(tags=["Realtime"])


@router.websocket("/ws/stations")
async def websocket_stations_endpoint(websocket: WebSocket):
    """
    Public WebSocket endpoint streaming live connector status, session meter telemetry,
    and booking state updates.
    """
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep socket alive and receive client heartbeats or messages
            _ = await websocket.receive_text()
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket)
    except Exception as exc:
        logger.debug(f"WebSocket client connection error: {exc}")
        await ws_manager.disconnect(websocket)
