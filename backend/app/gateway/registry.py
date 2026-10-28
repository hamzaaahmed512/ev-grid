"""
VoltRelay — Charger Connection Registry
Tracks live TCP charger client sockets, active sessions, and heartbeats.
"""

import asyncio
import time
from dataclasses import dataclass
from typing import Optional, Dict, List, Any


@dataclass
class ConnectionInfo:
    charger_id: str
    writer: asyncio.StreamWriter
    peer_addr: str
    connected_at: float
    last_seen: float
    status: str = "AVAILABLE"


class ChargerRegistry:
    """Thread-safe in-memory registry of connected EV charger TCP clients."""

    def __init__(self):
        self._connections: Dict[str, ConnectionInfo] = {}
        self._lock = asyncio.Lock()

    async def register(
        self, charger_id: str, writer: asyncio.StreamWriter, peer_addr: str
    ) -> None:
        """Register or update an active charger connection."""
        now = time.time()
        async with self._lock:
            # If an existing connection exists with a different writer, safely close the old one
            old_conn = self._connections.get(charger_id)
            if old_conn and old_conn.writer != writer:
                try:
                    if not old_conn.writer.is_closing():
                        old_conn.writer.close()
                except Exception:
                    pass

            self._connections[charger_id] = ConnectionInfo(
                charger_id=charger_id,
                writer=writer,
                peer_addr=peer_addr,
                connected_at=now,
                last_seen=now,
            )

    async def unregister(
        self, charger_id: str, writer: Optional[asyncio.StreamWriter] = None
    ) -> bool:
        """
        Unregister a charger connection.
        If writer is provided, only unregisters if the registered writer matches.
        """
        async with self._lock:
            conn = self._connections.get(charger_id)
            if not conn:
                return False
            if writer is not None and conn.writer != writer:
                # Connected on a newer socket; do not unregister
                return False
            del self._connections[charger_id]
            return True

    async def update_last_seen(self, charger_id: str) -> None:
        """Touch the last_seen timestamp for a charger."""
        async with self._lock:
            conn = self._connections.get(charger_id)
            if conn:
                conn.last_seen = time.time()

    async def get_writer(self, charger_id: str) -> Optional[asyncio.StreamWriter]:
        """Get the stream writer for a connected charger."""
        async with self._lock:
            conn = self._connections.get(charger_id)
            return conn.writer if conn else None

    async def is_connected(self, charger_id: str) -> bool:
        """Check if a charger is currently connected."""
        async with self._lock:
            return charger_id in self._connections

    async def get_stale_chargers(self, timeout_seconds: float) -> List[str]:
        """
        Return a list of charger_ids that have not sent any telemetry or keep-alive
        within the given timeout threshold.
        """
        now = time.time()
        stale: List[str] = []
        async with self._lock:
            for cid, conn in self._connections.items():
                if now - conn.last_seen > timeout_seconds:
                    stale.append(cid)
        return stale

    async def get_all_connected(self) -> Dict[str, Dict[str, Any]]:
        """Return diagnostic snapshot of all active charger connections."""
        async with self._lock:
            return {
                cid: {
                    "charger_id": conn.charger_id,
                    "peer_addr": conn.peer_addr,
                    "connected_at": conn.connected_at,
                    "last_seen": conn.last_seen,
                    "status": conn.status,
                }
                for cid, conn in self._connections.items()
            }


# Global singleton instance
charger_registry = ChargerRegistry()
