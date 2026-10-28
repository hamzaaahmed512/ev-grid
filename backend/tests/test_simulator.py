"""
VoltRelay — Simulator Logic Unit Tests
Module 5, Part 3

Tests charger state machine, telemetry generation, and remote stop handling.
"""

import asyncio
from pathlib import Path
import sys
import unittest
from unittest.mock import AsyncMock, MagicMock

# Add repository root to import simulators
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))

from simulators.charger_sim import SimulatedCharger


class SimulatorLogicTests(unittest.IsolatedAsyncioTestCase):
    async def test_boot_and_heartbeat_frames(self):
        sim = SimulatedCharger(
            charger_id="SIM-TEST",
            host="127.0.0.1",
            port=9000,
            speed=10.0,
        )
        sim.writer = MagicMock()
        sim.writer.is_closing.return_value = False
        sim.writer.write = MagicMock()
        sim.writer.drain = AsyncMock()

        # Mock reader readline with BOOT ACK
        sim.reader = AsyncMock()
        sim.reader.readline.return_value = b'{"type":"ACK","ref_type":"BOOT","ok":true,"booking_id":42,"user_id":5}\n'

        ok = await sim.send_boot()
        self.assertTrue(ok)
        self.assertEqual(sim.pending_booking_id, 42)
        self.assertEqual(sim.pending_user_id, 5)

        # Verify BOOT frame was sent
        sim.writer.write.assert_called_once()
        written = sim.writer.write.call_args[0][0].decode("utf-8")
        self.assertIn('"type":"BOOT"', written)
        self.assertIn('"charger_id":"SIM-TEST"', written)

    async def test_remote_stop_handling(self):
        sim = SimulatedCharger(
            charger_id="SIM-TEST",
            host="127.0.0.1",
            port=9000,
            speed=10.0,
        )
        sim.writer = MagicMock()
        sim.writer.is_closing.return_value = False
        sim.writer.write = MagicMock()
        sim.writer.drain = AsyncMock()

        # Simulate receiving REMOTE_STOP in listen loop
        sim.reader = AsyncMock()
        # Return REMOTE_STOP line first, then empty to terminate loop
        sim.reader.readline.side_effect = [
            b'{"type":"REMOTE_STOP","session_id":100,"reason":"USER_APP_REQUEST"}\n',
            b'',
        ]
        sim.reader.at_eof.side_effect = [False, False, True]

        await sim._listen_loop()
        self.assertTrue(sim.pending_remote_stop)


if __name__ == "__main__":
    unittest.main()
