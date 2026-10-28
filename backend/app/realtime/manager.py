"""
VoltRelay — WebSocket Real-Time Connection Manager
Manages active browser connections and broadcasts live station, telemetry, and booking events.
"""

import asyncio
import json
import logging
from typing import Set, Any
from fastapi import WebSocket

logger = logging.getLogger("realtime.manager")


class ConnectionManager:
    """Manages WebSocket connections and broadcasts telemetry events."""

    def __init__(self):
        self._connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        """Accept and register an incoming WebSocket connection."""
        await websocket.accept()
        async with self._lock:
            self._connections.add(websocket)
        logger.info(f"WebSocket client connected. Total clients: {len(self._connections)}")

    async def disconnect(self, websocket: WebSocket) -> None:
        """Remove a disconnected WebSocket."""
        async with self._lock:
            self._connections.discard(websocket)
        logger.info(f"WebSocket client disconnected. Total clients: {len(self._connections)}")

    async def broadcast(self, data: dict[str, Any]) -> None:
        """
        Broadcast a JSON event dictionary to all connected clients.
        Failing clients are safely removed without breaking other clients.
        """
        if not self._connections:
            return

        text = json.dumps(data, separators=(",", ":"))
        async with self._lock:
            clients = list(self._connections)

        dead_clients: list[WebSocket] = []

        async def _send(ws: WebSocket):
            try:
                await ws.send_text(text)
            except Exception:
                dead_clients.append(ws)

        await asyncio.gather(*[_send(ws) for ws in clients], return_exceptions=True)

        if dead_clients:
            async with self._lock:
                for dead in dead_clients:
                    self._connections.discard(dead)
            logger.debug(f"Removed {len(dead_clients)} stale WebSocket client(s).")

    def broadcast_sync(self, data: dict[str, Any]) -> None:
        """
        Thread/event-loop safe helper to broadcast events from synchronous contexts
        (such as database hooks or synchronous message dispatch).
        """
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self.broadcast(data))
        except RuntimeError:
            # No running event loop in current thread
            pass


# Global singleton instance
ws_manager = ConnectionManager()
