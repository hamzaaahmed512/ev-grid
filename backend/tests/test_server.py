"""
VoltRelay — TCP Gateway Server Integration Tests
Tests TCP socket connections, live framing, message dispatch over wire, and disconnect teardown.
"""

import asyncio
import json
import unittest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.station import Station
from app.models.connector import Connector
from app.models.charging_session import ChargingSession
from app.models.booking import Booking
from app.models.user import User
from app.models.vehicle import Vehicle
from app.gateway.registry import ChargerRegistry
from app.gateway.handlers import GatewayMessageHandler
from app.gateway.server import TCPGatewayServer


class TCPGatewayServerIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        # Setup in-memory DB
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(
            self.engine,
            tables=[
                User.__table__,
                Vehicle.__table__,
                Station.__table__,
                Connector.__table__,
                Booking.__table__,
                ChargingSession.__table__,
            ],
        )
        self.Session = sessionmaker(bind=self.engine)

        db = self.Session()
        station = Station(id=1, name="Test Hub", latitude=31.0, longitude=74.0, price_per_kwh=40.0)
        db.add(station)
        connector = Connector(id=1, station_id=1, connector_type="CCS2", charger_id="SIM-TEST", status="OFFLINE")
        db.add(connector)
        db.commit()
        db.close()

        self.registry = ChargerRegistry()
        self.handler = GatewayMessageHandler(session_factory=self.Session)
        # Port 0 selects an ephemeral port
        self.server = TCPGatewayServer(
            host="127.0.0.1",
            port=0,
            registry=self.registry,
            handler=self.handler,
            heartbeat_timeout=1.0,  # Fast timeout for testing
        )
        await self.server.start()
        # Find assigned port
        sock = self.server._server.sockets[0]
        self.port = sock.getsockname()[1]

    async def asyncTearDown(self):
        await self.server.stop()
        self.engine.dispose()

    async def test_tcp_handshake_boot_heartbeat_and_disconnect(self):
        # 1. Connect over TCP
        reader, writer = await asyncio.open_connection("127.0.0.1", self.port)

        # 2. Send BOOT message
        boot_msg = {
            "type": "BOOT",
            "charger_id": "SIM-TEST",
            "ts": "2026-10-28T14:00:00Z",
            "firmware_version": "v1.0.0",
            "model": "TestBox",
        }
        writer.write((json.dumps(boot_msg) + "\n").encode("utf-8"))
        await writer.drain()

        # Read ACK
        response_line = await reader.readline()
        ack = json.loads(response_line.decode("utf-8"))
        self.assertTrue(ack["ok"])
        self.assertEqual(ack["ref_type"], "BOOT")
        self.assertEqual(ack["charger_id"], "SIM-TEST")

        # Verify registry and DB updated
        self.assertTrue(await self.registry.is_connected("SIM-TEST"))
        db = self.Session()
        conn = db.query(Connector).filter_by(charger_id="SIM-TEST").first()
        self.assertEqual(conn.status, "AVAILABLE")
        db.close()

        # 3. Send HEARTBEAT message
        hb_msg = {
            "type": "HEARTBEAT",
            "charger_id": "SIM-TEST",
            "ts": "2026-10-28T14:00:10Z",
        }
        writer.write((json.dumps(hb_msg) + "\n").encode("utf-8"))
        await writer.drain()

        hb_line = await reader.readline()
        hb_ack = json.loads(hb_line.decode("utf-8"))
        self.assertTrue(hb_ack["ok"])
        self.assertEqual(hb_ack["ref_type"], "HEARTBEAT")

        # 4. Disconnect client
        writer.close()
        await writer.wait_closed()

        # Allow small interval for server to process disconnect
        await asyncio.sleep(0.2)

        # Verify unregistered and marked OFFLINE
        self.assertFalse(await self.registry.is_connected("SIM-TEST"))
        db = self.Session()
        conn = db.query(Connector).filter_by(charger_id="SIM-TEST").first()
        self.assertEqual(conn.status, "OFFLINE")
        db.close()


if __name__ == "__main__":
    unittest.main()
