"use client";

import React, { useEffect, useState } from "react";
import { bookingApi, ApiBooking, ApiError } from "@/lib/api";

export default function BookingsPage() {
  const [bookings, setBookings] = useState<ApiBooking[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"upcoming" | "history">("upcoming");

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

  const upcomingBookings = bookings.filter((b) => b.status === "CONFIRMED");
  const historyBookings = bookings.filter(
    (b) => b.status === "CANCELLED" || b.status === "COMPLETED"
  );

  const displayedBookings =
    activeTab === "upcoming" ? upcomingBookings : historyBookings;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex items-center justify-between mb-6 border-b pb-4">
        <h1 className="text-2xl font-bold text-gray-800">My Charging Bookings</h1>
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveTab("upcoming")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "upcoming"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Upcoming ({upcomingBookings.length})
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "history"
                ? "bg-blue-600 text-white"
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

      {loading ? (
        <div className="py-12 text-center text-gray-500">Loading your bookings...</div>
      ) : displayedBookings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-12 text-center">
          <p className="text-gray-500">No {activeTab} bookings found.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {displayedBookings.map((b) => (
            <div
              key={b.id}
              className="rounded-xl border bg-white p-5 shadow-sm space-y-3"
            >
              <div className="flex items-center justify-between">
                <span
                  className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                    b.status === "CONFIRMED"
                      ? "bg-green-100 text-green-800"
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
    </div>
  );
}