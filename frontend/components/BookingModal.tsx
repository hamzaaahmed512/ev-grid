import React, { useState, useEffect } from "react";
import {
  vehicleApi,
  bookingApi,
  ApiStation,
  ApiVehicle,
  ApiConnector,
  ApiError,
} from "../lib/api";

interface BookingModalProps {
  station: ApiStation;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function BookingModal({
  station,
  isOpen,
  onClose,
  onSuccess,
}: BookingModalProps) {
  const [vehicles, setVehicles] = useState<ApiVehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | ''>('');
  const [selectedConnectorId, setSelectedConnectorId] = useState<number | ''>('');
  const [startTime, setStartTime] = useState<string>('');
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  
  const [loading, setLoading] = useState<boolean>(false);
  const [fetchingVehicles, setFetchingVehicles] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadVehicles();
      const defaultTime = new Date();
      defaultTime.setHours(defaultTime.getHours() + 1);
      defaultTime.setMinutes(0);
      setStartTime(defaultTime.toISOString().slice(0, 16));
    }
  }, [isOpen]);

  async function loadVehicles() {
    try {
      setFetchingVehicles(true);
      setError(null);
      const data = await vehicleApi.list();
      setVehicles(data);
      if (data.length > 0) {
        setSelectedVehicleId(data[0].id);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError("Failed to load your vehicles.");
      }
    } finally {
      setFetchingVehicles(false);
    }
  }

  if (!isOpen) return null;

  const selectedVehicle = vehicles.find((v) => v.id === Number(selectedVehicleId));
  const connectors: ApiConnector[] = station.connectors ?? [];

  const isConnectorCompatible = (connectorType: string) => {
    if (!selectedVehicle) return true;
    return connectorType.trim().toLowerCase() === selectedVehicle.connector_type.trim().toLowerCase();
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedVehicleId || !selectedConnectorId || !startTime) {
      setError("Please fill in all required fields.");
      return;
    }

    const chosenConnector = connectors.find((c) => c.id === Number(selectedConnectorId));
    if (chosenConnector && selectedVehicle) {
      if (!isConnectorCompatible(chosenConnector.connector_type)) {
        setError("Selected connector type does not match your vehicle's connector type.");
        return;
      }
    }

    try {
      setLoading(true);
      setError(null);

      const formattedStartTime = new Date(startTime).toISOString();

      await bookingApi.create({
        vehicle_id: Number(selectedVehicleId),
        connector_id: Number(selectedConnectorId),
        start_time: formattedStartTime,
        duration_minutes: Number(durationMinutes),
      });

      onSuccess();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError("An unexpected error occurred while booking.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between border-b pb-3">
          <h3 className="text-xl font-bold text-gray-800">Book Charging Slot</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 font-semibold text-lg"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 mb-2">
          <h4 className="font-semibold text-gray-700">{station.name}</h4>
          <p className="text-sm text-gray-500">{station.address}, {station.city}</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
            {error}
          </div>
        )}

        {fetchingVehicles ? (
          <div className="py-8 text-center text-gray-500">Loading your vehicles...</div>
        ) : vehicles.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-gray-600 mb-2">No vehicles found in your garage.</p>
            <p className="text-sm text-gray-400">Please add a vehicle to your garage before booking a slot.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Vehicle
              </label>
              <select
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none"
                required
              >
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.make} {v.model} ({v.year}) - {v.connector_type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Connector
              </label>
              <select
                value={selectedConnectorId}
                onChange={(e) => setSelectedConnectorId(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none"
                required
              >
                <option value="">-- Choose Connector --</option>
                {connectors.map((c) => {
                  const compatible = isConnectorCompatible(c.connector_type);
                  return (
                    <option key={c.id} value={c.id} disabled={!compatible}>
                      {c.connector_type} | {c.max_power_kw} kW | ${c.price_per_kwh}/kWh {compatible ? "" : " (Incompatible)"}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Time
              </label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Duration (Minutes)
              </label>
              <select
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value={15}>15 Minutes</option>
                <option value={30}>30 Minutes</option>
                <option value={60}>60 Minutes (1 Hour)</option>
                <option value={120}>120 Minutes (2 Hours)</option>
                <option value={180}>180 Minutes (3 Hours)</option>
                <option value={240}>240 Minutes (4 Hours)</option>
              </select>
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || vehicles.length === 0}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? "Booking..." : "Confirm Booking"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}