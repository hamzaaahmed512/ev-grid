"""
VoltRelay — Charger Registry Unit Tests
Tests connection tracking, heartbeat liveness, and stale connection detection.
"""

import asyncio
import time
import unittest
from unittest.mock import MagicMock

from app.gateway.registry import ChargerRegistry


class ChargerRegistryTests(unittest.IsolatedAsyncioTestCase):
    async def test_register_and_lookup(self):
        registry = ChargerRegistry()
        mock_writer = MagicMock()
        mock_writer.is_closing.return_value = False

        await registry.register("SIM-001", mock_writer, "127.0.0.1:50000")
        self.assertTrue(await registry.is_connected("SIM-001"))
        self.assertFalse(await registry.is_connected("SIM-999"))

        writer = await registry.get_writer("SIM-001")
        self.assertEqual(writer, mock_writer)

        all_conns = await registry.get_all_connected()
        self.assertIn("SIM-001", all_conns)
        self.assertEqual(all_conns["SIM-001"]["peer_addr"], "127.0.0.1:50000")

    async def test_re_register_closes_old_socket(self):
        registry = ChargerRegistry()
        old_writer = MagicMock()
        old_writer.is_closing.return_value = False
        new_writer = MagicMock()
        new_writer.is_closing.return_value = False

        await registry.register("SIM-001", old_writer, "127.0.0.1:50001")
        await registry.register("SIM-001", new_writer, "127.0.0.1:50002")

        old_writer.close.assert_called_once()
        self.assertEqual(await registry.get_writer("SIM-001"), new_writer)

    async def test_unregister_guards_against_stale_writers(self):
        registry = ChargerRegistry()
        old_writer = MagicMock()
        old_writer.is_closing.return_value = False
        new_writer = MagicMock()
        new_writer.is_closing.return_value = False

        await registry.register("SIM-001", new_writer, "127.0.0.1:50003")

        # Attempting unregister with old_writer should fail
        unregistered = await registry.unregister("SIM-001", writer=old_writer)
        self.assertFalse(unregistered)
        self.assertTrue(await registry.is_connected("SIM-001"))

        # Unregister with matching writer succeeds
        unregistered = await registry.unregister("SIM-001", writer=new_writer)
        self.assertTrue(unregistered)
        self.assertFalse(await registry.is_connected("SIM-001"))

    async def test_stale_detection(self):
        registry = ChargerRegistry()
        mock_writer = MagicMock()
        mock_writer.is_closing.return_value = False

        await registry.register("SIM-001", mock_writer, "127.0.0.1:50004")
        # Manually backdate last_seen
        async with registry._lock:
            registry._connections["SIM-001"].last_seen = time.time() - 35.0

        stale = await registry.get_stale_chargers(timeout_seconds=30.0)
        self.assertIn("SIM-001", stale)

        # Touching last_seen removes it from stale list
        await registry.update_last_seen("SIM-001")
        stale_after_touch = await registry.get_stale_chargers(timeout_seconds=30.0)
        self.assertNotIn("SIM-001", stale_after_touch)


if __name__ == "__main__":
    unittest.main()
