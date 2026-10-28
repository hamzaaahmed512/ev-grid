"""
VoltRelay — WebSocket Real-Time Infrastructure Unit Tests
Module 5, Part 4
"""

import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock
from fastapi import WebSocket

from app.realtime.manager import ConnectionManager


class RealtimeManagerTests(unittest.IsolatedAsyncioTestCase):
    async def test_connect_disconnect_and_broadcast(self):
        manager = ConnectionManager()
        ws1 = AsyncMock(spec=WebSocket)
        ws2 = AsyncMock(spec=WebSocket)

        await manager.connect(ws1)
        await manager.connect(ws2)
        self.assertEqual(len(manager._connections), 2)

        # Broadcast event
        event = {"event": "connector_status", "connector_id": 5, "status": "OCCUPIED"}
        await manager.broadcast(event)

        ws1.send_text.assert_called_once()
        ws2.send_text.assert_called_once()

        # Disconnect ws1
        await manager.disconnect(ws1)
        self.assertEqual(len(manager._connections), 1)
        self.assertNotIn(ws1, manager._connections)

    async def test_failed_client_does_not_break_others(self):
        manager = ConnectionManager()
        ws_good = AsyncMock(spec=WebSocket)
        ws_bad = AsyncMock(spec=WebSocket)
        ws_bad.send_text.side_effect = Exception("Socket closed prematurely")

        await manager.connect(ws_good)
        await manager.connect(ws_bad)
        self.assertEqual(len(manager._connections), 2)

        # Broadcast should succeed on ws_good and prune ws_bad
        await manager.broadcast({"event": "ping"})
        ws_good.send_text.assert_called_once()

        # ws_bad should be cleaned up automatically
        self.assertNotIn(ws_bad, manager._connections)
        self.assertIn(ws_good, manager._connections)


if __name__ == "__main__":
    unittest.main()
