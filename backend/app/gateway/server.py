"""
VoltRelay — TCP Live Gateway Server
Asyncio TCP server accepting persistent charger connections on port 9000.
Handles frame parsing, message dispatch, watchdog keep-alive monitoring, and graceful shutdown.
"""

import asyncio
import logging
from typing import Optional

from app.config import settings
from app.gateway.protocol import (
    MAX_MESSAGE_BYTES,
    parse_and_validate_frame,
)
from app.gateway.registry import charger_registry, ChargerRegistry
from app.gateway.handlers import default_handler, GatewayMessageHandler

logger = logging.getLogger("gateway.tcp")


class TCPGatewayServer:
    """Asyncio TCP server for live EV charger communication."""

    def __init__(
        self,
        host: Optional[str] = None,
        port: Optional[int] = None,
        registry: Optional[ChargerRegistry] = None,
        handler: Optional[GatewayMessageHandler] = None,
        heartbeat_timeout: Optional[float] = None,
    ):
        self.host = host or getattr(settings, "TCP_GATEWAY_HOST", "0.0.0.0")
        self.port = port or getattr(settings, "TCP_GATEWAY_PORT", 9000)
        self.registry = registry or charger_registry
        self.handler = handler or default_handler
        self.heartbeat_timeout = (
            heartbeat_timeout
            if heartbeat_timeout is not None
            else getattr(settings, "HEARTBEAT_TIMEOUT_SECONDS", 30)
        )

        self._server: Optional[asyncio.AbstractServer] = None
        self._watchdog_task: Optional[asyncio.Task] = None
        self._is_running = False

    async def start(self) -> None:
        """Start the TCP server and liveness watchdog task."""
        if self._is_running:
            return

        self._server = await asyncio.start_server(
            self._handle_client,
            host=self.host,
            port=self.port,
            limit=MAX_MESSAGE_BYTES * 2,
        )
        self._is_running = True
        self._watchdog_task = asyncio.create_task(self._watchdog_loop())

        sockets = self._server.sockets or []
        addrs = ", ".join(str(sock.getsockname()) for sock in sockets)
        logger.info(f"VoltRelay TCP Gateway listening on {addrs} (timeout={self.heartbeat_timeout}s)")

    async def stop(self) -> None:
        """Gracefully shut down the TCP server, cancel watchdog, and close client sockets."""
        if not self._is_running:
            return

        self._is_running = False

        if self._watchdog_task and not self._watchdog_task.done():
            self._watchdog_task.cancel()
            try:
                await self._watchdog_task
            except asyncio.CancelledError:
                pass

        if self._server:
            self._server.close()
            await self._server.wait_closed()
            self._server = None

        logger.info("VoltRelay TCP Gateway stopped")

    async def _handle_client(
        self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter
    ) -> None:
        """Handle an individual persistent TCP charger connection."""
        peer = writer.get_extra_info("peername")
        peer_addr = f"{peer[0]}:{peer[1]}" if peer else "unknown"
        registered_charger_id: Optional[str] = None

        logger.info(f"Incoming TCP connection from {peer_addr}")

        try:
            while self._is_running and not reader.at_eof():
                try:
                    line_bytes = await reader.readline()
                except (ConnectionResetError, BrokenPipeError):
                    break

                if not line_bytes:
                    # Client closed connection
                    break

                if len(line_bytes) > MAX_MESSAGE_BYTES:
                    # Protocol violation: Close connection immediately to prevent buffer exhaustion attacks
                    logger.warning(
                        f"Connection from {peer_addr} exceeded max frame size ({len(line_bytes)} bytes); dropping."
                    )
                    break

                raw_line = line_bytes.decode("utf-8", errors="replace")
                data, err_ack = parse_and_validate_frame(raw_line)

                if err_ack:
                    writer.write(err_ack.encode("utf-8"))
                    await writer.drain()
                    continue

                if data is None:
                    # Blank line or whitespace; ignore per protocol
                    continue

                charger_id = data["charger_id"]
                registered_charger_id = charger_id

                # Update registry
                await self.registry.register(charger_id, writer, peer_addr)
                await self.registry.update_last_seen(charger_id)

                # Process message and dispatch ACK
                ack_response = self.handler.dispatch(data)
                writer.write(ack_response.encode("utf-8"))
                await writer.drain()

        except Exception as exc:
            logger.error(f"Error handling client {peer_addr}: {exc}", exc_info=True)
        finally:
            if registered_charger_id:
                # Mark charger OFFLINE upon disconnect
                await self.registry.unregister(registered_charger_id, writer)
                self.handler.mark_charger_offline(registered_charger_id)
                logger.info(f"Charger {registered_charger_id} disconnected; marked OFFLINE.")

            try:
                if not writer.is_closing():
                    writer.close()
                    await writer.wait_closed()
            except Exception:
                pass

    async def _watchdog_loop(self) -> None:
        """Periodic watchdog sweeping for stale chargers that missed heartbeats."""
        while self._is_running:
            try:
                await asyncio.sleep(5)
                stale_chargers = await self.registry.get_stale_chargers(self.heartbeat_timeout)
                for cid in stale_chargers:
                    logger.warning(
                        f"Charger {cid} missed heartbeats (> {self.heartbeat_timeout}s); marking OFFLINE."
                    )
                    writer = await self.registry.get_writer(cid)
                    await self.registry.unregister(cid)
                    self.handler.mark_charger_offline(cid)
                    if writer:
                        try:
                            if not writer.is_closing():
                                writer.close()
                        except Exception:
                            pass
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error(f"Watchdog error: {exc}", exc_info=True)


# Global singleton server instance
tcp_server = TCPGatewayServer()
