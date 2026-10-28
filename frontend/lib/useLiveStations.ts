"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { stationApi, ApiStation, ApiLiveEvent } from "./api";

export interface LiveConnectorState {
  status: string;
  power_kw: number;
  ts: string;
}

export interface LiveMeterState {
  session_id: number;
  connector_id?: number;
  station_id?: number;
  kwh: number;
  soc: number;
  power_kw: number;
  cost?: number;
}

export function useLiveStations() {
  const [connectorStates, setConnectorStates] = useState<Record<number, LiveConnectorState>>({});
  const [meterStates, setMeterStates] = useState<Record<number, LiveMeterState>>({});
  const [bookingStates, setBookingStates] = useState<Record<number, string>>({});
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [polledStations, setPolledStations] = useState<ApiStation[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const backoffRef = useRef<number>(1000);
  const isMountedRef = useRef<boolean>(true);

  // Derive WebSocket URL from NEXT_PUBLIC_API_URL
  const getWsUrl = useCallback(() => {
    const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
    let wsBase = rawApiUrl.replace(/^http:\/\//i, "ws://").replace(/^https:\/\//i, "wss://");
    if (wsBase.endsWith("/")) {
      wsBase = wsBase.slice(0, -1);
    }
    return `${wsBase}/ws/stations`;
  }, []);

  // Polling fallback
  const pollStations = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) {
      return; // Pause polling while tab is hidden
    }
    try {
      const data = await stationApi.list();
      if (!isMountedRef.current) return;
      setPolledStations(data);

      // Merge polled connectors into live states
      const updates: Record<number, LiveConnectorState> = {};
      data.forEach((s) => {
        s.connectors?.forEach((c) => {
          updates[c.id] = {
            status: c.status,
            power_kw: c.max_power_kw || 0,
            ts: new Date().toISOString(),
          };
        });
      });
      setConnectorStates((prev) => ({ ...prev, ...updates }));
    } catch (err) {
      // Quiet fallback error
    }
  }, []);

  // WebSocket connection & lifecycle
  useEffect(() => {
    isMountedRef.current = true;

    function connectWs() {
      if (typeof window === "undefined" || !isMountedRef.current) return;

      const wsUrl = getWsUrl();
      let socket: WebSocket;
      try {
        socket = new WebSocket(wsUrl);
      } catch (err) {
        scheduleReconnect();
        return;
      }

      wsRef.current = socket;

      socket.onopen = () => {
        if (!isMountedRef.current) return;
        setIsConnected(true);
        backoffRef.current = 1000; // Reset backoff on success

        // Stop fallback polling when live socket connects
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      };

      socket.onmessage = (event) => {
        if (!isMountedRef.current) return;
        try {
          const data: ApiLiveEvent = JSON.parse(event.data);
          if (data.event === "connector_status" && data.connector_id) {
            setConnectorStates((prev) => ({
              ...prev,
              [data.connector_id!]: {
                status: data.status || "AVAILABLE",
                power_kw: data.power_kw ?? 0,
                ts: data.ts || new Date().toISOString(),
              },
            }));
          } else if (data.event === "session_meter" && data.session_id) {
            setMeterStates((prev) => ({
              ...prev,
              [data.session_id!]: {
                session_id: data.session_id!,
                connector_id: data.connector_id,
                station_id: data.station_id,
                kwh: data.kwh ?? 0,
                soc: data.soc ?? 0,
                power_kw: data.power_kw ?? 0,
                cost: data.cost ?? 0,
              },
            }));
          } else if (data.event === "booking_status" && data.booking_id) {
            setBookingStates((prev) => ({
              ...prev,
              [data.booking_id!]: data.status || "CONFIRMED",
            }));
          }
        } catch (err) {
          // Ignore malformed message frames
        }
      };

      socket.onclose = () => {
        if (!isMountedRef.current) return;
        setIsConnected(false);
        wsRef.current = null;
        scheduleReconnect();
      };

      socket.onerror = () => {
        if (!isMountedRef.current) return;
        socket.close();
      };
    }

    function scheduleReconnect() {
      if (!isMountedRef.current) return;

      // Start fallback polling if not already started
      if (!pollIntervalRef.current) {
        pollStations();
        pollIntervalRef.current = setInterval(pollStations, 15000);
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      const delay = backoffRef.current;
      backoffRef.current = Math.min(backoffRef.current * 1.5, 30000);

      reconnectTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          connectWs();
        }
      }, delay);
    }

    connectWs();

    // Listen to document visibility changes to pause/resume polling
    const onVisibilityChange = () => {
      if (!document.hidden && !isConnected && !pollIntervalRef.current) {
        pollStations();
        pollIntervalRef.current = setInterval(pollStations, 15000);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      isMountedRef.current = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [getWsUrl, pollStations, isConnected]);

  return {
    connectorStates,
    meterStates,
    bookingStates,
    isConnected,
    polledStations,
    refreshFallback: pollStations,
  };
}
