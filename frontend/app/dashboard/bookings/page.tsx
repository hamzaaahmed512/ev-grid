"use client";

import React, { useEffect, useState } from "react";
import { bookingApi, ApiBooking, ApiError } from "@/lib/api";
import LiveSessionCard from "@/components/LiveSessionCard";
import { useLiveStations } from "@/lib/useLiveStations";

export default function BookingsPage() {
  const [bookings, setBookings] = useState<ApiBooking[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"active" | "upcoming" | "history">("upcoming");

  const { bookingStates } = useLiveStations();

  async function loadBookings() {
    try {
      setLoading(true);
      setError(null);
      const data = await bookingApi.list();
      setBookings(data);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError("Failed to load bookings.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBookings();
  }, []);

  async function handleCancel(id: number) {
    if (!confirm("Are you sure you want to cancel this booking?")) return;
    try {
      await bookingApi.cancel(id);
      loadBookings();
    } catch (err) {
      if (err instanceof ApiError) {
        alert(err.detail);
      } else {
        alert("Failed to cancel booking.");
      }
    }
  }

  // Merge live WebSocket booking status overrides
  const effectiveBookings = bookings.map((b) => {
    const liveStatus = bookingStates[b.id];
    if (liveStatus && liveStatus !== b.status) {
      return { ...b, status: liveStatus as ApiBooking["status"] };
    }
    return b;
  });

  const activeBookings = effectiveBookings.filter((b) => b.status === "IN_PROGRESS");
  const upcomingBookings = effectiveBookings.filter((b) => b.status === "CONFIRMED");
  const historyBookings = effectiveBookings.filter(
    (b) => b.status === "CANCELLED" || b.status === "COMPLETED"
  );

  // Auto-switch to active tab if there are active charging sessions
  useEffect(() => {
    if (activeBookings.length > 0 && activeTab !== "active") {
      setActiveTab("active");
    }
  }, [activeBookings.length]);

  return (
    <div className="mx-auto max-w-5xl p-6">
      {/* Title & Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 border-b pb-4 gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-gray-800">My Charging Bookings</h1>
            <a
              href="/dashboard/sessions"
              className="text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-full transition-colors"
            >
              Session History →
            </a>
          </div>
          <p className="text-sm text-gray-500">Track and manage reservations and live charging sessions.</p>
        </div>
        <div className="flex space-x-2">
          {activeBookings.length > 0 && (
            <button
              onClick={() => setActiveTab("active")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors flex items-center space-x-1.5 ${
                activeTab === "active"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Active Charging ({activeBookings.length})</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab("upcoming")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "upcoming"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Upcoming ({upcomingBookings.length})
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "history"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            History ({historyBookings.length})
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700 border border-red-200">
          {error}
        </div>
      )}

      {/* Active Charging View */}
      {activeTab === "active" && (
        <div className="space-y-6">
          {activeBookings.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 py-12 text-center">
              <p className="text-gray-500">No active charging sessions right now.</p>
            </div>
          ) : (
            activeBookings.map((b) => (
              <LiveSessionCard
                key={b.id}
                bookingId={b.id}
                connectorId={b.connector.id}
                stationName={b.station.name}
                onSessionEnded={loadBookings}
              />
            ))
          )}
        </div>
      )}

      {/* Upcoming & History Views */}
      {activeTab !== "active" && (
        <>
          {loading ? (
            <div className="py-12 text-center text-gray-500">Loading your bookings...</div>
          ) : (activeTab === "upcoming" ? upcomingBookings : historyBookings).length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 py-12 text-center">
              <p className="text-gray-500">No {activeTab} bookings found.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {(activeTab === "upcoming" ? upcomingBookings : historyBookings).map((b) => (
                <div
                  key={b.id}
                  className="rounded-xl border bg-white p-5 shadow-sm space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                        b.status === "CONFIRMED"
                          ? "bg-blue-100 text-blue-800"
                          : b.status === "IN_PROGRESS"
                          ? "bg-emerald-100 text-emerald-800"
                          : b.status === "CANCELLED"
                          ? "bg-red-100 text-red-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {b.status}
                    </span>
                    <span className="text-xs text-gray-400">Booking #{b.id}</span>
                  </div>

                  <div>
                    <h3 className="font-bold text-gray-800">{b.station.name}</h3>
                    <p className="text-sm text-gray-500">
                      {b.station.address}, {b.station.city}
                    </p>
                  </div>

                  <div className="text-sm space-y-1 bg-gray-50 p-3 rounded-lg">
                    <p>
                      <span className="font-medium text-gray-600">Vehicle:</span>{" "}
                      {b.vehicle.name} ({b.vehicle.connector_type})
                    </p>
                    <p>
                      <span className="font-medium text-gray-600">Connector:</span>{" "}
                      {b.connector.connector_type} ({b.connector.max_power_kw} kW)
                    </p>
                    <p>
                      <span className="font-medium text-gray-600">Start:</span>{" "}
                      {new Date(b.start_time).toLocaleString()}
                    </p>
                    <p>
                      <span className="font-medium text-gray-600">Duration:</span>{" "}
                      {b.duration_minutes} minutes
                    </p>
                  </div>

                  {b.status === "CONFIRMED" && (
                    <div className="flex justify-end pt-2">
                      <button
                        onClick={() => handleCancel(b.id)}
                        className="rounded-lg bg-red-50 px-4 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors"
                      >
                        Cancel Booking
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}