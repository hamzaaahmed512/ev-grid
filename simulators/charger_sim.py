#!/usr/bin/env python3
"""
VoltRelay — Standalone EV Charger Simulator
Module 5, Part 3

Simulates one or more EV chargers communicating exclusively over persistent TCP
with the VoltRelay Live Status Gateway. Uses standard library only.
"""

import argparse
import asyncio
from datetime import datetime, timezone
import json
import logging
import random
import sys
from typing import Optional, Dict, Any

# Protocol definitions per docs/protocol.md
MSG_BOOT = "BOOT"
MSG_HEARTBEAT = "HEARTBEAT"
MSG_STATUS = "STATUS"
MSG_SESSION_START = "SESSION_START"
MSG_METER = "METER"
MSG_SESSION_STOP = "SESSION_STOP"
MSG_ACK = "ACK"
MSG_REMOTE_STOP = "REMOTE_STOP"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("Simulator")


def utc_iso() -> str:
    """Return current UTC timestamp in ISO 8601 format with trailing Z."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class SimulatedCharger:
    """Simulates a single physical EV charging unit over a persistent TCP socket."""

    def __init__(
        self,
        charger_id: str,
        host: str,
        port: int,
        speed: float = 1.0,
        booking_aware: bool = False,
        max_power_kw: float = 60.0,
    ):
        self.charger_id = charger_id
        self.host = host
        self.port = port
        self.speed = max(0.1, float(speed))
        self.booking_aware = booking_aware
        self.max_power_kw = max_power_kw

        self.reader: Optional[asyncio.StreamReader] = None
        self.writer: Optional[asyncio.StreamWriter] = None
        self.is_running = True
        self.current_state = "AVAILABLE"  # AVAILABLE, OCCUPIED, FAULTED
        self.active_session_id: Optional[int] = None
        self.pending_remote_stop = False
        self.pending_booking_id: Optional[int] = None
        self.pending_user_id: Optional[int] = None

        # Background tasks
        self._heartbeat_task: Optional[asyncio.Task] = None
        self._listener_task: Optional[asyncio.Task] = None
        self._session_task: Optional[asyncio.Task] = None

    def log(self, msg: str, level: str = "info") -> None:
        prefix = f"[{self.charger_id}]"
        if level == "warning":
            logger.warning(f"{prefix} {msg}")
        elif level == "error":
            logger.error(f"{prefix} {msg}")
        else:
            logger.info(f"{prefix} {msg}")

    async def run(self) -> None:
        """Main connection and lifecycle loop with exponential backoff on disconnect."""
        backoff = 1.0
        while self.is_running:
            try:
                self.log(f"Connecting to TCP Gateway at {self.host}:{self.port}...")
                self.reader, self.writer = await asyncio.open_connection(self.host, self.port)
                self.log("Connected successfully.")
                backoff = 1.0  # Reset backoff on successful connect

                # Send BOOT message
                boot_ok = await self.send_boot()
                if not boot_ok:
                    self.log("BOOT was rejected or failed. Reconnecting in 5s...", level="warning")
                    await self._cleanup_connection()
                    await asyncio.sleep(5.0)
                    continue

                # Start background listener and heartbeat tasks
                self._listener_task = asyncio.create_task(self._listen_loop())
                self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

                # Run charging simulation loop until disconnected or stopped
                await self._simulation_lifecycle()

            except (ConnectionRefusedError, OSError) as exc:
                self.log(f"Connection failed: {exc}. Retrying in {backoff:.1f}s...", level="warning")
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2.0, 30.0)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                self.log(f"Unexpected error in lifecycle: {exc}", level="error")
                await asyncio.sleep(3.0)
            finally:
                await self._cleanup_connection()

    async def _send_frame(self, data: dict[str, Any]) -> None:
        """Send a newline-delimited JSON document over TCP."""
        if not self.writer or self.writer.is_closing():
            return
        line = json.dumps(data, separators=(",", ":")) + "\n"
        self.writer.write(line.encode("utf-8"))
        await self.writer.drain()

    async def send_boot(self) -> bool:
        """Send BOOT handshake message and wait for initial ACK."""
        boot_msg = {
            "type": MSG_BOOT,
            "charger_id": self.charger_id,
            "ts": utc_iso(),
            "firmware_version": "v2.4.0",
            "model": "VoltSim-DC-Fast",
            "vendor": "VoltRelay Labs",
            "max_power_kw": self.max_power_kw,
            "connector_types": ["CCS2"],
        }
        await self._send_frame(boot_msg)

        # Wait directly for BOOT response
        try:
            line_bytes = await self.reader.readline()
            if not line_bytes:
                return False
            ack = json.loads(line_bytes.decode("utf-8"))
            if ack.get("type") == MSG_ACK and ack.get("ref_type") == MSG_BOOT and ack.get("ok"):
                self.log("BOOT acknowledged by gateway.")
                # Check if gateway provided booking info in ACK
                if ack.get("booking_id"):
                    self.pending_booking_id = ack.get("booking_id")
                    self.pending_user_id = ack.get("user_id")
                    self.log(f"Gateway informed of confirmed booking #{self.pending_booking_id}")
                return True
            else:
                self.log(f"BOOT error: {ack.get('error')} - {ack.get('message')}", level="error")
                return False
        except Exception as exc:
            self.log(f"Failed reading BOOT response: {exc}", level="error")
            return False

    async def _listen_loop(self) -> None:
        """Background reader for incoming ACKs and server commands (e.g. REMOTE_STOP)."""
        try:
            while self.is_running and self.reader:
                line = await self.reader.readline()
                if not line:
                    self.log("Socket connection closed by gateway.", level="warning")
                    break

                try:
                    msg = json.loads(line.decode("utf-8"))
                except Exception:
                    continue

                m_type = msg.get("type")
                if m_type == MSG_REMOTE_STOP:
                    session_id = msg.get("session_id")
                    reason = msg.get("reason", "USER_APP_REQUEST")
                    self.log(f"Received REMOTE_STOP from gateway for session {session_id} (reason: {reason})")
                    self.pending_remote_stop = True
                elif m_type == MSG_ACK:
                    # Gateway can optionally piggyback booking-window info in heartbeat/status ACKs
                    if self.booking_aware and msg.get("booking_id") and not self.active_session_id:
                        self.pending_booking_id = msg.get("booking_id")
                        self.pending_user_id = msg.get("user_id")
                        self.log(f"Booking window opened: Booking #{self.pending_booking_id}")
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            self.log(f"Error in listener loop: {exc}", level="error")
        finally:
            # Signal lifecycle that socket closed
            if self.writer and not self.writer.is_closing():
                try:
                    self.writer.close()
                except Exception:
                    pass

    async def _heartbeat_loop(self) -> None:
        """Send keep-alive HEARTBEAT every ~10s divided by simulation speed."""
        interval = max(1.0, 10.0 / self.speed)
        uptime = 0
        try:
            while self.is_running:
                await asyncio.sleep(interval)
                uptime += int(10 * self.speed)
                hb_msg = {
                    "type": MSG_HEARTBEAT,
                    "charger_id": self.charger_id,
                    "ts": utc_iso(),
                    "uptime_seconds": uptime,
                }
                await self._send_frame(hb_msg)
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            self.log(f"Error in heartbeat loop: {exc}", level="error")

    async def _simulation_lifecycle(self) -> None:
        """Simulate realistic charging sessions, faults, and idle periods."""
        while self.is_running and self.writer and not self.writer.is_closing():
            # 1. AVAILABLE State — wait before starting a session
            self.current_state = "AVAILABLE"
            await self._send_frame({
                "type": MSG_STATUS,
                "charger_id": self.charger_id,
                "ts": utc_iso(),
                "status": "AVAILABLE",
            })

            # Check for fault injection (~5% probability)
            if random.random() < 0.05:
                await self._simulate_fault()
                continue

            # Wait randomized 20–60 seconds (scaled by speed) or until booking arrives
            idle_wait = random.uniform(20.0, 60.0) / self.speed
            self.log(f"Idle at AVAILABLE. Next session in ~{idle_wait * self.speed:.1f}s simulated ({idle_wait:.1f}s real)...")

            elapsed = 0.0
            step = 1.0 / self.speed
            while elapsed < idle_wait:
                if not self.is_running or not self.writer or self.writer.is_closing():
                    return
                if self.booking_aware and self.pending_booking_id:
                    self.log(f"Starting scheduled booking session for #{self.pending_booking_id}!")
                    break
                await asyncio.sleep(step)
                elapsed += step

            # 2. Start Charging Session
            await self._run_charging_session()

    async def _simulate_fault(self) -> None:
        """Simulate an occasional safety trip / hardware fault."""
        self.current_state = "FAULTED"
        fault_code = random.choice(["OVER_TEMP", "GROUND_FAULT", "CABLE_LOCK_ERROR"])
        self.log(f"Safety fault triggered: {fault_code}. Connector FAULTED.", level="warning")
        await self._send_frame({
            "type": MSG_STATUS,
            "charger_id": self.charger_id,
            "ts": utc_iso(),
            "status": "FAULTED",
            "error_code": fault_code,
            "error_description": f"Simulated hardware safety trip: {fault_code}",
        })

        # Wait ~30s / speed before clearing fault
        recover_wait = 30.0 / self.speed
        await asyncio.sleep(recover_wait)
        self.log("Fault condition resolved. Returning to AVAILABLE.")
        await self._send_frame({
            "type": MSG_STATUS,
            "charger_id": self.charger_id,
            "ts": utc_iso(),
            "status": "AVAILABLE",
        })
        self.current_state = "AVAILABLE"

    async def _run_charging_session(self) -> None:
        """Execute an active charging session with METER telemetry and stop criteria."""
        self.current_state = "OCCUPIED"
        self.pending_remote_stop = False

        # Prepare SESSION_START parameters
        soc = round(random.uniform(15.0, 60.0), 1)
        target_soc = round(random.uniform(80.0, 100.0), 1)
        booking_id = self.pending_booking_id
        user_id = self.pending_user_id
        self.pending_booking_id = None
        self.pending_user_id = None

        start_msg = {
            "type": MSG_SESSION_START,
            "charger_id": self.charger_id,
            "ts": utc_iso(),
            "booking_id": booking_id,
            "user_id": user_id,
            "soc": soc,
        }
        self.log(f"Starting session (Initial SOC: {soc}%, Target SOC: {target_soc}%, Booking: {booking_id})")
        await self._send_frame(start_msg)

        # In real life, gateway returns ACK with session_id. We'll wait slightly or synthesize
        # a unique session ID if not received over listener.
        await asyncio.sleep(0.5)
        # Session ID assigned
        session_id = random.randint(100, 9999) if not self.active_session_id else self.active_session_id
        self.active_session_id = session_id

        total_kwh = 0.0
        meter_interval = max(0.5, 5.0 / self.speed)
        stop_reason = "FULL_BATTERY"

        while self.is_running and self.writer and not self.writer.is_closing():
            await asyncio.sleep(meter_interval)

            # Check if remote stop was commanded
            if self.pending_remote_stop:
                stop_reason = "REMOTE_STOP"
                self.log("Remote stop initiated. Ramping down power...")
                break

            # Check random user unplug (~5% chance before full battery)
            if soc > 70.0 and random.random() < 0.05:
                stop_reason = "LOCAL_STOP"
                self.log("Driver pressed local stop button.")
                break

            # Charging curve calculation:
            # Power ramps toward max_power_kw; tapers linearly from 80% to 100%
            if soc < 80.0:
                current_power = self.max_power_kw * random.uniform(0.92, 1.0)
            else:
                # Taper from 100% down to 20% between 80% and 100% SOC
                taper_factor = max(0.15, 1.0 - ((soc - 80.0) / 20.0) * 0.8)
                current_power = self.max_power_kw * taper_factor

            # Energy delivered in this interval: power (kW) * time (hours)
            dt_hours = (5.0 * self.speed) / 3600.0
            kwh_delta = current_power * dt_hours
            total_kwh += kwh_delta

            # SOC increment: assume typical 60 kWh battery pack
            soc_delta = (kwh_delta / 60.0) * 100.0
            soc = min(100.0, round(soc + soc_delta, 1))

            # Send METER reading
            meter_msg = {
                "type": MSG_METER,
                "charger_id": self.charger_id,
                "ts": utc_iso(),
                "session_id": session_id,
                "kwh_delivered": round(total_kwh, 4),
                "power_kw": round(current_power, 2),
                "soc": soc,
                "temperature_c": round(25.0 + (current_power / self.max_power_kw) * 18.0, 1),
            }
            await self._send_frame(meter_msg)
            self.log(f"Telemetry: {soc}% SOC | {current_power:.1f} kW | {total_kwh:.3f} kWh")

            if soc >= target_soc:
                stop_reason = "FULL_BATTERY"
                self.log(f"Target SOC ({target_soc}%) reached.")
                break

        # 3. Stop Session
        stop_msg = {
            "type": MSG_SESSION_STOP,
            "charger_id": self.charger_id,
            "ts": utc_iso(),
            "session_id": session_id,
            "total_kwh": round(total_kwh, 4),
            "stop_reason": stop_reason,
            "soc_end": soc,
        }
        self.log(f"Finalizing session #{session_id}: delivered {total_kwh:.3f} kWh (reason: {stop_reason})")
        await self._send_frame(stop_msg)
        self.active_session_id = None
        self.pending_remote_stop = False

        # Brief cool-down pause before returning to AVAILABLE
        await asyncio.sleep(2.0 / self.speed)

    async def _cleanup_connection(self) -> None:
        """Cancel background tasks and close client socket."""
        for task in [self._heartbeat_task, self._listener_task]:
            if task and not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        self._heartbeat_task = None
        self._listener_task = None

        if self.writer:
            try:
                if not self.writer.is_closing():
                    self.writer.close()
                    await self.writer.wait_closed()
            except Exception:
                pass
            self.writer = None
            self.reader = None

    def stop(self) -> None:
        """Signal simulator to terminate."""
        self.is_running = False


async def run_simulators(args: argparse.Namespace) -> None:
    """Run multiple simulated chargers concurrently."""
    chargers_list = [c.strip() for c in args.chargers.split(",") if c.strip()]
    if not chargers_list:
        logger.error("No valid charger IDs provided.")
        return

    simulators = [
        SimulatedCharger(
            charger_id=cid,
            host=args.host,
            port=args.port,
            speed=args.speed,
            booking_aware=args.booking_aware,
        )
        for cid in chargers_list
    ]

    logger.info(
        f"Starting VoltRelay Simulator for {len(simulators)} chargers: {', '.join(chargers_list)} "
        f"(speed={args.speed}x, booking_aware={args.booking_aware})"
    )

    tasks = [asyncio.create_task(sim.run()) for sim in simulators]

    try:
        await asyncio.gather(*tasks)
    except asyncio.CancelledError:
        for sim in simulators:
            sim.stop()
        await asyncio.gather(*tasks, return_exceptions=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="VoltRelay EV Charger Hardware Simulator (TCP)"
    )
    parser.add_argument(
        "--host",
        type=str,
        default="127.0.0.1",
        help="TCP Gateway host (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=9000,
        help="TCP Gateway port (default: 9000)",
    )
    parser.add_argument(
        "--chargers",
        type=str,
        default="SIM-001,SIM-002,SIM-003",
        help="Comma-separated charger identifiers (e.g. SIM-001,SIM-002)",
    )
    parser.add_argument(
        "--speed",
        type=float,
        default=1.0,
        help="Simulation time multiplier (e.g. 10 for 10x speed, default: 1.0)",
    )
    parser.add_argument(
        "--booking-aware",
        action="store_true",
        default=False,
        help="Enable booking-aware mode using gateway ACK signals",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    try:
        asyncio.run(run_simulators(args))
    except KeyboardInterrupt:
        logger.info("Simulator interrupted by user (Ctrl+C). Terminating gracefully.")
    except Exception as exc:
        logger.error(f"Fatal error: {exc}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
