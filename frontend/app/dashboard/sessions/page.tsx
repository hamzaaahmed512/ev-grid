"use client";

import React, { useEffect, useState } from "react";
import { sessionApi, ApiChargingSession, ApiError } from "@/lib/api";

export default function SessionsHistoryPage() {
  const [sessions, setSessions] = useState<ApiChargingSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  async function loadSessions() {
    try {
      setLoading(true);
      setError(null);
      const data = await sessionApi.me();
      setSessions(data);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError("Failed to load charging session history.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSessions();
  }, []);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 border-b pb-4 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Charging Session History</h1>
          <p className="text-sm text-gray-500">
            Review detailed telemetry, delivered energy, and costs for past sessions.
          </p>
        </div>
        <button
          onClick={loadSessions}
          disabled={loading}
          className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50 self-start sm:self-auto"
        >
          🔄 Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700 border border-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-gray-500">Loading session history...</div>
      ) : sessions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-12 text-center space-y-2">
          <p className="text-lg font-semibold text-gray-700">No charging sessions found</p>
          <p className="text-sm text-gray-500">
            Your completed charging sessions will appear here with energy and cost metrics.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-gray-600 font-semibold text-left">
                  <tr>
                    <th className="py-3 px-4">Session #</th>
                    <th className="py-3 px-4">Station / Connector</th>
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Duration</th>
                    <th className="py-3 px-4">Energy (kWh)</th>
                    <th className="py-3 px-4">Peak Power</th>
                    <th className="py-3 px-4">Total Cost</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sessions.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-medium text-gray-800">
                        #{s.id}
                        {s.booking_id && (
                          <span className="block text-xs font-normal text-gray-400">
                            Booking #{s.booking_id}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-gray-800">
                        {s.station_name || `Connector #${s.connector_id}`}
                        {s.connector_type && (
                          <span className="block text-xs text-gray-500">
                            {s.connector_type}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-gray-600">
                        {new Date(s.started_at).toLocaleString([], {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="py-3.5 px-4 text-gray-600">
                        {s.duration_minutes ?? 0} mins
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-gray-800">
                        {s.kwh_delivered.toFixed(2)} kWh
                      </td>
                      <td className="py-3.5 px-4 text-blue-600 font-medium">
                        {s.peak_power_kw.toFixed(1)} kW
                      </td>
                      <td className="py-3.5 px-4 font-bold text-gray-900">
                        Rs {s.cost.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            s.status === "ACTIVE"
                              ? "bg-emerald-100 text-emerald-800 animate-pulse"
                              : s.status === "COMPLETED"
                              ? "bg-gray-100 text-gray-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {s.status}
                          {s.stop_reason && (
                            <span className="ml-1 text-[10px] text-gray-500">
                              ({s.stop_reason})
                            </span>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
