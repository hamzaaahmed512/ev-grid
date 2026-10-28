"""
VoltRelay — TCP Live Gateway Package (Module 5)
Exports TCP server, registry, message handlers, and protocol helpers.
"""

from app.gateway.protocol import (
    PROTOCOL_VERSION,
    parse_and_validate_frame,
    build_ack,
    build_remote_stop,
)
from app.gateway.registry import charger_registry, ChargerRegistry
from app.gateway.handlers import default_handler, GatewayMessageHandler
from app.gateway.server import tcp_server, TCPGatewayServer

__all__ = [
    "PROTOCOL_VERSION",
    "parse_and_validate_frame",
    "build_ack",
    "build_remote_stop",
    "charger_registry",
    "ChargerRegistry",
    "default_handler",
    "GatewayMessageHandler",
    "tcp_server",
    "TCPGatewayServer",
]
