"""
VoltRelay — TCP Live Gateway Message Handlers
Handles all six inbound message types: BOOT, HEARTBEAT, STATUS, SESSION_START, METER, SESSION_STOP.
Uses short-lived SQLAlchemy sessions with transactional safety and broadcasts real-time WebSocket events.
"""

from datetime import datetime, timezone, timedelta
import logging
from typing import Any, Callable, Optional
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.connector import Connector
from app.models.charging_session import ChargingSession
from app.models.booking import Booking
from app.gateway.protocol import (
    MSG_BOOT,
    MSG_HEARTBEAT,
    MSG_STATUS,
    MSG_SESSION_START,
    MSG_METER,
    MSG_SESSION_STOP,
    ERR_UNKNOWN_CHARGER,
    ERR_SESSION_ALREADY_ACTIVE,
    ERR_SESSION_NOT_FOUND,
    build_ack,
)
from app.realtime.manager import ws_manager

logger = logging.getLogger("gateway.handlers")


def parse_timestamp(ts_str: Optional[str]) -> datetime:
    """Parse an ISO 8601 timestamp string into a timezone-aware datetime."""
    if not ts_str:
        return datetime.now(timezone.utc)
    try:
        normalized = ts_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return datetime.now(timezone.utc)


class GatewayMessageHandler:
    """Processes parsed gateway messages and performs database state transitions."""

    def __init__(self, session_factory: Callable[[], Session] = SessionLocal):
        self.session_factory = session_factory

    def dispatch(self, msg: dict[str, Any]) -> str:
        """Route an inbound message to its specific handler method and return ACK string."""
        msg_type = msg.get("type", "").upper()
        handler_map = {
            MSG_BOOT: self.handle_boot,
            MSG_HEARTBEAT: self.handle_heartbeat,
            MSG_STATUS: self.handle_status,
            MSG_SESSION_START: self.handle_session_start,
            MSG_METER: self.handle_meter,
            MSG_SESSION_STOP: self.handle_session_stop,
        }
        handler = handler_map.get(msg_type)
        if not handler:
            return build_ack(
                charger_id=msg.get("charger_id", "UNKNOWN"),
                ref_type=msg_type,
                ok=False,
                error="UNKNOWN_MESSAGE_TYPE",
                message=f"No handler registered for message type '{msg_type}'.",
            )
        return handler(msg)

    def _find_open_booking(self, db: Session, connector_id: int) -> Optional[Booking]:
        """Find an active or upcoming confirmed booking for this connector within the current window."""
        now = datetime.now(timezone.utc)
        window_start = now - timedelta(minutes=15)
        window_end = now + timedelta(minutes=15)
        return (
            db.query(Booking)
            .filter(
                Booking.connector_id == connector_id,
                Booking.status == "CONFIRMED",
                Booking.start_time <= window_end,
                Booking.end_time >= window_start,
            )
            .first()
        )

    def handle_boot(self, msg: dict[str, Any]) -> str:
        charger_id = msg["charger_id"]
        ts_dt = parse_timestamp(msg.get("ts"))

        db: Session = self.session_factory()
        try:
            connector = db.query(Connector).filter(Connector.charger_id == charger_id).first()
            if not connector:
                return build_ack(
                    charger_id=charger_id,
                    ref_type=MSG_BOOT,
                    ok=False,
                    error=ERR_UNKNOWN_CHARGER,
                    message=f"charger_id '{charger_id}' does not exist in connectors table.",
                )

            connector.last_seen = ts_dt
            if connector.status == "OFFLINE":
                connector.status = "AVAILABLE"
            db.commit()

            # Broadcast real-time status
            ws_manager.broadcast_sync({
                "event": "connector_status",
                "connector_id": connector.id,
                "station_id": connector.station_id,
                "status": connector.status,
                "power_kw": float(connector.current_power_kw or 0.0),
                "ts": msg.get("ts", ""),
            })

            # Check for open booking window to notify booking-aware simulator
            booking = self._find_open_booking(db, connector.id)
            b_id = booking.id if booking else None
            u_id = booking.user_id if booking else None

            return build_ack(
                charger_id=charger_id,
                ref_type=MSG_BOOT,
                ok=True,
                booking_id=b_id,
                user_id=u_id,
            )
        except Exception as exc:
            db.rollback()
            return build_ack(
                charger_id=charger_id,
                ref_type=MSG_BOOT,
                ok=False,
                error="INTERNAL_ERROR",
                message=str(exc),
            )
        finally:
            db.close()

    def handle_heartbeat(self, msg: dict[str, Any]) -> str:
        charger_id = msg["charger_id"]
        ts_dt = parse_timestamp(msg.get("ts"))

        db: Session = self.session_factory()
        try:
            connector = db.query(Connector).filter(Connector.charger_id == charger_id).first()
            if not connector:
                return build_ack(
                    charger_id=charger_id,
                    ref_type=MSG_HEARTBEAT,
                    ok=False,
                    error=ERR_UNKNOWN_CHARGER,
                    message=f"charger_id '{charger_id}' does not exist in connectors table.",
                )

            prev_status = connector.status
            connector.last_seen = ts_dt
            if connector.status == "OFFLINE":
                connector.status = "AVAILABLE"
            db.commit()

            if prev_status == "OFFLINE":
                ws_manager.broadcast_sync({
                    "event": "connector_status",
                    "connector_id": connector.id,
                    "station_id": connector.station_id,
                    "status": connector.status,
                    "power_kw": float(connector.current_power_kw or 0.0),
                    "ts": msg.get("ts", ""),
                })

            # Piggyback open booking info if available
            booking = self._find_open_booking(db, connector.id)
            b_id = booking.id if booking else None
            u_id = booking.user_id if booking else None

            return build_ack(
                charger_id=charger_id,
                ref_type=MSG_HEARTBEAT,
                ok=True,
                booking_id=b_id,
                user_id=u_id,
            )
        except Exception as exc:
            db.rollback()
            return build_ack(
                charger_id=charger_id,
                ref_type=MSG_HEARTBEAT,
                ok=False,
                error="INTERNAL_ERROR",
                message=str(exc),
            )
        finally:
            db.close()

    def handle_status(self, msg: dict[str, Any]) -> str:
        charger_id = msg["charger_id"]
        ts_dt = parse_timestamp(msg.get("ts"))
        new_status = msg.get("status")

        db: Session = self.session_factory()
        try:
            connector = db.query(Connector).filter(Connector.charger_id == charger_id).first()
            if not connector:
                return build_ack(
                    charger_id=charger_id,
                    ref_type=MSG_STATUS,
                    ok=False,
                    error=ERR_UNKNOWN_CHARGER,
                    message=f"charger_id '{charger_id}' does not exist in connectors table.",
                )

            connector.status = new_status
            connector.last_seen = ts_dt
            if new_status in ("AVAILABLE", "FAULTED"):
                connector.current_power_kw = 0.00
            db.commit()

            # Broadcast status update to WebSocket clients
            ws_manager.broadcast_sync({
                "event": "connector_status",
                "connector_id": connector.id,
                "station_id": connector.station_id,
                "status": connector.status,
                "power_kw": float(connector.current_power_kw or 0.0),
                "ts": msg.get("ts", ""),
            })

            return build_ack(
                charger_id=charger_id,
                ref_type=MSG_STATUS,
                ok=True,
            )
        except Exception as exc:
            db.rollback()
            return build_ack(
                charger_id=charger_id,
                ref_type=MSG_STATUS,
                ok=False,
                error="INTERNAL_ERROR",
                message=str(exc),
            )
        finally:
            db.close()

    def handle_session_start(self, msg: dict[str, Any]) -> str:
        charger_id = msg["charger_id"]
        ts_dt = parse_timestamp(msg.get("ts"))
        booking_id = msg.get("booking_id")
        user_id = msg.get("user_id")
        soc = msg.get("soc")

        db: Session = self.session_factory()
        try:
            connector = db.query(Connector).filter(Connector.charger_id == charger_id).first()
            if not connector:
                return build_ack(
                    charger_id=charger_id,
                    ref_type=MSG_SESSION_START,
                    ok=False,
                    error=ERR_UNKNOWN_CHARGER,
                    message=f"charger_id '{charger_id}' does not exist in connectors table.",
                )

            # Check for existing ACTIVE session on this connector
            active_session = (
                db.query(ChargingSession)
                .filter(
                    ChargingSession.connector_id == connector.id,
                    ChargingSession.status == "ACTIVE",
                )
                .first()
            )
            if active_session:
                return build_ack(
                    charger_id=charger_id,
                    ref_type=MSG_SESSION_START,
                    ok=False,
                    error=ERR_SESSION_ALREADY_ACTIVE,
                    message=f"Connector {charger_id} already has an ACTIVE charging session (id={active_session.id}).",
                )

            # Booking validation per requirements:
            # - Verify booking exists, belongs to this connector, has status CONFIRMED, and falls within permitted window.
            # - If invalid, treat as walk-in with booking_id = None and log a warning.
            resolved_booking_id = None
            resolved_user_id = user_id

            if booking_id:
                booking = db.query(Booking).filter(Booking.id == booking_id).first()
                if not booking:
                    logger.warning(f"Booking #{booking_id} not found; treating session as walk-in.")
                elif booking.connector_id != connector.id:
                    logger.warning(
                        f"Booking #{booking_id} connector ({booking.connector_id}) does not match "
                        f"charger connector ({connector.id}); treating session as walk-in."
                    )
                elif booking.status != "CONFIRMED":
                    logger.warning(
                        f"Booking #{booking_id} status is '{booking.status}' (expected 'CONFIRMED'); "
                        "treating session as walk-in."
                    )
                else:
                    # Check booking time window (15 minute grace buffer before start / after end)
                    b_start = booking.start_time
                    b_end = booking.end_time
                    if b_start.tzinfo is None:
                        b_start = b_start.replace(tzinfo=timezone.utc)
                    if b_end.tzinfo is None:
                        b_end = b_end.replace(tzinfo=timezone.utc)

                    if not (b_start - timedelta(minutes=15) <= ts_dt <= b_end + timedelta(minutes=15)):
                        logger.warning(
                            f"Booking #{booking_id} window ({b_start} - {b_end}) outside current session "
                            f"time ({ts_dt}); treating session as walk-in."
                        )
                    else:
                        # Valid booking
                        resolved_booking_id = booking.id
                        booking.status = "IN_PROGRESS"
                        if not resolved_user_id:
                            resolved_user_id = booking.user_id

            # Create new ChargingSession
            new_session = ChargingSession(
                connector_id=connector.id,
                booking_id=resolved_booking_id,
                user_id=resolved_user_id,
                status="ACTIVE",
                started_at=ts_dt,
                soc_start=soc,
                kwh_delivered=0.0000,
                peak_power_kw=0.00,
                cost=0.00,
            )
            db.add(new_session)

            # Update connector status
            connector.status = "OCCUPIED"
            connector.last_seen = ts_dt
            db.commit()
            db.refresh(new_session)

            # Broadcast connector status update
            ws_manager.broadcast_sync({
                "event": "connector_status",
                "connector_id": connector.id,
                "station_id": connector.station_id,
                "status": "OCCUPIED",
                "power_kw": 0.0,
                "ts": msg.get("ts", ""),
            })

            # Broadcast booking status if linked
            if resolved_booking_id:
                ws_manager.broadcast_sync({
                    "event": "booking_status",
                    "booking_id": resolved_booking_id,
                    "status": "IN_PROGRESS",
                })

            return build_ack(
                charger_id=charger_id,
                ref_type=MSG_SESSION_START,
                ok=True,
                session_id=new_session.id,
            )
        except Exception as exc:
            db.rollback()
            return build_ack(
                charger_id=charger_id,
                ref_type=MSG_SESSION_START,
                ok=False,
                error="INTERNAL_ERROR",
                message=str(exc),
            )
        finally:
            db.close()

    def handle_meter(self, msg: dict[str, Any]) -> str:
        charger_id = msg["charger_id"]
        ts_dt = parse_timestamp(msg.get("ts"))
        session_id = msg.get("session_id")
        kwh = float(msg.get("kwh_delivered", 0.0))
        power = float(msg.get("power_kw", 0.0))
        soc = msg.get("soc")

        db: Session = self.session_factory()
        try:
            session = (
                db.query(ChargingSession)
                .filter(ChargingSession.id == session_id, ChargingSession.status == "ACTIVE")
                .first()
            )
            if not session:
                return build_ack(
                    charger_id=charger_id,
                    ref_type=MSG_METER,
                    ok=False,
                    session_id=session_id,
                    error=ERR_SESSION_NOT_FOUND,
                    message=f"Session {session_id} does not exist or is not currently ACTIVE.",
                )

            connector = db.query(Connector).filter(Connector.id == session.connector_id).first()

            # Update session telemetry
            session.kwh_delivered = kwh
            if power > float(session.peak_power_kw or 0.0):
                session.peak_power_kw = power
            if soc is not None:
                session.soc_end = soc

            # Update cost based on connector's station price
            unit_price = float(connector.price_per_kwh) if connector else 0.0
            session.cost = round(kwh * unit_price, 2)

            # Update connector telemetry
            if connector:
                connector.current_power_kw = power
                connector.last_seen = ts_dt

            db.commit()

            # Broadcast live meter telemetry
            ws_manager.broadcast_sync({
                "event": "session_meter",
                "session_id": session.id,
                "connector_id": connector.id if connector else None,
                "station_id": connector.station_id if connector else None,
                "kwh": float(session.kwh_delivered),
                "soc": float(session.soc_end or 0.0),
                "power_kw": float(power),
                "cost": float(session.cost),
            })

            return build_ack(
                charger_id=charger_id,
                ref_type=MSG_METER,
                ok=True,
                session_id=session_id,
            )
        except Exception as exc:
            db.rollback()
            return build_ack(
                charger_id=charger_id,
                ref_type=MSG_METER,
                ok=False,
                session_id=session_id,
                error="INTERNAL_ERROR",
                message=str(exc),
            )
        finally:
            db.close()

    def handle_session_stop(self, msg: dict[str, Any]) -> str:
        charger_id = msg["charger_id"]
        ts_dt = parse_timestamp(msg.get("ts"))
        session_id = msg.get("session_id")
        total_kwh = float(msg.get("total_kwh", 0.0))
        stop_reason = msg.get("stop_reason")
        soc_end = msg.get("soc_end")

        db: Session = self.session_factory()
        try:
            session = (
                db.query(ChargingSession)
                .filter(ChargingSession.id == session_id, ChargingSession.status == "ACTIVE")
                .first()
            )
            if not session:
                return build_ack(
                    charger_id=charger_id,
                    ref_type=MSG_SESSION_STOP,
                    ok=False,
                    session_id=session_id,
                    error=ERR_SESSION_NOT_FOUND,
                    message=f"Session {session_id} does not exist or is not currently ACTIVE.",
                )

            connector = db.query(Connector).filter(Connector.id == session.connector_id).first()

            # Finalize session record
            session.status = "FAULTED" if stop_reason == "FAULT" else "COMPLETED"
            session.ended_at = ts_dt
            session.kwh_delivered = total_kwh
            if soc_end is not None:
                session.soc_end = soc_end
            session.stop_reason = stop_reason

            unit_price = float(connector.price_per_kwh) if connector else 0.0
            session.cost = round(total_kwh * unit_price, 2)

            # Update linked booking status
            resolved_booking_id = session.booking_id
            if resolved_booking_id:
                booking = db.query(Booking).filter(Booking.id == resolved_booking_id).first()
                if booking:
                    booking.status = "COMPLETED"

            # Update connector status
            new_connector_status = "FAULTED" if stop_reason == "FAULT" else "AVAILABLE"
            if connector:
                connector.status = new_connector_status
                connector.current_power_kw = 0.00
                connector.last_seen = ts_dt

            db.commit()

            # Broadcast connector status update
            if connector:
                ws_manager.broadcast_sync({
                    "event": "connector_status",
                    "connector_id": connector.id,
                    "station_id": connector.station_id,
                    "status": new_connector_status,
                    "power_kw": 0.0,
                    "ts": msg.get("ts", ""),
                })

            # Broadcast booking status update
            if resolved_booking_id:
                ws_manager.broadcast_sync({
                    "event": "booking_status",
                    "booking_id": resolved_booking_id,
                    "status": "COMPLETED",
                })

            return build_ack(
                charger_id=charger_id,
                ref_type=MSG_SESSION_STOP,
                ok=True,
                session_id=session_id,
            )
        except Exception as exc:
            db.rollback()
            return build_ack(
                charger_id=charger_id,
                ref_type=MSG_SESSION_STOP,
                ok=False,
                session_id=session_id,
                error="INTERNAL_ERROR",
                message=str(exc),
            )
        finally:
            db.close()

    def mark_charger_offline(self, charger_id: str) -> bool:
        """Mark a disconnected or timed-out charger as OFFLINE in the database."""
        db: Session = self.session_factory()
        try:
            connector = db.query(Connector).filter(Connector.charger_id == charger_id).first()
            if connector:
                connector.status = "OFFLINE"
                connector.current_power_kw = 0.00
                db.commit()

                # Broadcast OFFLINE event
                ws_manager.broadcast_sync({
                    "event": "connector_status",
                    "connector_id": connector.id,
                    "station_id": connector.station_id,
                    "status": "OFFLINE",
                    "power_kw": 0.0,
                    "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                })
                return True
            return False
        except Exception:
            db.rollback()
            return False
        finally:
            db.close()


# Default handler instance using production SessionLocal
default_handler = GatewayMessageHandler(SessionLocal)
