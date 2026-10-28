"use client";

import React, { useEffect, useState } from "react";
import { sessionApi, connectorApi, ApiChargingSession, ApiError } from "@/lib/api";
import { useLiveStations } from "@/lib/useLiveStations";

interface Props {
  bookingId: number;
  connectorId: number;
  stationName: string;
  onSessionEnded?: () => void;
}

export default function LiveSessionCard({
  bookingId,
  connectorId,
  stationName,
  onSessionEnded,
}: Props) {
  const [session, setSession] = useState<ApiChargingSession | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [stopLoading, setStopLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [stopMessage, setStopMessage] = useState<string | null>(null);

  const { meterStates, connectorStates } = useLiveStations();

  // Load session associated with this booking / connector
  useEffect(() => {
    let alive = true;
    async function fetchSession() {
      try {
        setLoading(true);
        // First try to check connector live status
        const liveInfo = await connectorApi.live(connectorId);
        if (liveInfo.active_session && alive) {
          try {
            const fullSession = await sessionApi.get(liveInfo.active_session.session_id);
            if (alive) setSession(fullSession);
          } catch {
            // Fallback to active summary if full session route is restricted
            if (alive) {
              setSession({
                id: liveInfo.active_session.session_id,
                connector_id: connectorId,
                booking_id: bookingId,
                status: "ACTIVE",
                started_at: liveInfo.active_session.started_at,
                kwh_delivered: liveInfo.active_session.kwh_delivered,
                peak_power_kw: liveInfo.active_session.current_power_kw,
                cost: liveInfo.active_session.cost,
                soc_end: liveInfo.active_session.soc,
              });
            }
          }
        }
      } catch (err) {
        if (alive) setError("Failed to load active session telemetry.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    fetchSession();
    return () => {
      alive = false;
    };
  }, [bookingId, connectorId]);

  // Handle remote stop action
  async function handleStop() {
    if (!session) return;
    if (!confirm("Are you sure you want to stop this active charging session?")) return;

    try {
      setStopLoading(true);
      setError(null);
      setStopMessage(null);
      const res = await sessionApi.stop(session.id);
      setStopMessage(res.message || "Remote stop command delivered to charger.");
      if (onSessionEnded) {
        setTimeout(onSessionEnded, 3000);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError("Failed to dispatch stop request.");
      }
    } finally {
      setStopLoading(false);
    }
  }

  // Derive live telemetry: live WebSocket meter state overrides REST state
  const liveMeter = session ? meterStates[session.id] : undefined;
  const liveConnector = connectorStates[connectorId];

  const soc = liveMeter?.soc ?? session?.soc_end ?? session?.soc_start ?? 0;
  const kwh = liveMeter?.kwh ?? session?.kwh_delivered ?? 0.0;
  const power = liveMeter?.power_kw ?? liveConnector?.power_kw ?? session?.peak_power_kw ?? 0.0;
  const cost = liveMeter?.cost ?? session?.cost ?? 0.0;

  if (loading) {
    return (
      <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-5 shadow-sm text-center text-sm text-blue-700 animate-pulse">
        Connecting to live charger telemetry...
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-emerald-500 bg-gradient-to-br from-emerald-50/70 via-white to-blue-50/50 p-6 shadow-md space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-emerald-100 pb-3">
        <div className="flex items-center space-x-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-bold tracking-wider text-emerald-800 uppercase">
            Live Charging in Progress
          </span>
        </div>
        <span className="text-xs font-mono text-gray-500">
          Booking #{bookingId} {session ? `· Session #${session.id}` : ""}
        </span>
      </div>

      {/* Location */}
      <div>
        <h3 className="text-lg font-bold text-gray-800">{stationName}</h3>
        <p className="text-xs text-gray-500">Connector #{connectorId} (Active Telemetry)</p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* SOC */}
        <div className="rounded-xl bg-white p-3 border border-emerald-100 shadow-sm">
          <span className="text-xs text-gray-500">Battery State</span>
          <div className="text-xl font-black text-emerald-700">{soc.toFixed(1)}%</div>
          <div className="mt-1 h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, soc))}%` }}
            />
          </div>
        </div>

        {/* Energy */}
        <div className="rounded-xl bg-white p-3 border border-emerald-100 shadow-sm">
          <span className="text-xs text-gray-500">Energy Delivered</span>
          <div className="text-xl font-black text-gray-800">{kwh.toFixed(3)} <span className="text-xs font-normal">kWh</span></div>
        </div>

        {/* Current Power */}
        <div className="rounded-xl bg-white p-3 border border-emerald-100 shadow-sm">
          <span className="text-xs text-gray-500">Charging Power</span>
          <div className="text-xl font-black text-blue-600">{power.toFixed(1)} <span className="text-xs font-normal">kW</span></div>
        </div>

        {/* Running Cost */}
        <div className="rounded-xl bg-white p-3 border border-emerald-100 shadow-sm">
          <span className="text-xs text-gray-500">Running Cost</span>
          <div className="text-xl font-black text-amber-700">Rs {cost.toFixed(2)}</div>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
          {error}
        </div>
      )}

      {stopMessage && (
        <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700 border border-emerald-200">
          {stopMessage}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end pt-1">
        <button
          onClick={handleStop}
          disabled={stopLoading}
          className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-50 shadow-sm flex items-center space-x-1"
        >
          <span>🛑</span>
          <span>{stopLoading ? "Sending Stop Command..." : "Stop Charging"}</span>
        </button>
      </div>
    </div>
  );
}
