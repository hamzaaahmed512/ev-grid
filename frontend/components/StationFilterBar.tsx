"use client";

import { useEffect, useState } from "react";
import {
  vehicleApi,
  stationApi,
  type ApiVehicle,
  type ApiStation,
} from "../lib/api";

interface StationFilterBarProps {
  onStationsChange: (stations: ApiStation[]) => void;
  selectedVehicleId?: string;
}

export default function StationFilterBar({
  onStationsChange,
  selectedVehicleId,
}: StationFilterBarProps) {
  const [vehicles, setVehicles] = useState<ApiVehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<string>(
    selectedVehicleId ?? "all"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch user's registered vehicles on component mount
  useEffect(() => {
    let isMounted = true;
    const fetchVehicles = async () => {
      try {
        const data = await vehicleApi.list();
        if (isMounted) {
          setVehicles(data);
        }
      } catch (err) {
        // Not logged in or failed to load
        console.warn("Could not load vehicles for filter:", err);
      }
    };

    fetchVehicles();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleVehicleChange = async (value: string) => {
    setSelectedVehicle(value);
    setError(null);
    setLoading(true);

    try {
      if (value === "all") {
        // Show all stations
        const stations = await stationApi.list();
        onStationsChange(stations);
      } else {
        // Show only compatible stations for selected vehicle
        const vehicleId = Number(value);
        const response = await stationApi.compatible(vehicleId);
        onStationsChange(response.stations);
      }
    } catch (err) {
      console.error("Failed to filter stations:", err);
      setError("Failed to load compatible stations.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="card"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "12px",
        padding: "10px 16px",
        marginBottom: "16px",
        borderRadius: "14px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "1.2rem" }}>🚗</span>
        <label
          htmlFor="vehicle-filter"
          style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--ink)" }}
        >
          Filter by My EV:
        </label>
      </div>

      <select
        id="vehicle-filter"
        value={selectedVehicle}
        onChange={(e) => handleVehicleChange(e.target.value)}
        style={{
          padding: "8px 14px",
          fontSize: "0.88rem",
          fontWeight: 500,
          borderRadius: "10px",
          border: "1px solid var(--line)",
          background: "#ffffff",
          color: "var(--ink)",
          cursor: "pointer",
        }}
      >
        <option value="all">🌐 All Stations</option>
        {vehicles.map((vehicle) => (
          <option key={vehicle.id} value={vehicle.id}>
            ⚡ {vehicle.make} {vehicle.model} ({vehicle.connector_type})
          </option>
        ))}
      </select>

      {loading && (
        <span
          style={{
            fontSize: "0.82rem",
            color: "var(--green-dark, #16a34a)",
            fontWeight: 500,
          }}
        >
          Filtering stations...
        </span>
      )}

      {error && (
        <span
          style={{
            fontSize: "0.82rem",
            color: "var(--red, #dc2626)",
            fontWeight: 500,
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
}