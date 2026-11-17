/**
 * VoltRelay — Station Owner (Business Owner) API Client
 * Connects directly to the FastAPI backend (/owner/*).
 * Authenticates using Supabase session Bearer token.
 */

import { createClient } from "@/lib/supabase/client";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface OwnerStation {
  id: number;
  owner_id?: number | null;
  name: string;
  type: string;
  city?: string | null;
  address?: string | null;
  latitude: number;
  longitude: number;
  open_time?: string | null;
  close_time?: string | null;
  rating: number;
  status: string;
  price_per_kwh?: number | null;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  connector_count?: number;
  connectors?: OwnerConnector[];
}

export interface OwnerStationListResponse {
  items: OwnerStation[];
  total: number;
  page: number;
  page_size: number;
}

export interface OwnerConnector {
  id: number;
  station_id: number;
  label?: string | null;
  connector_type: string;
  power_kw: number;
  charging_type?: string | null;
  price_per_kwh?: number | null;
  status: "AVAILABLE" | "CHARGING" | "FAULT" | "OFFLINE" | "DISABLED" | string;
  last_seen?: string | null;
  is_active: boolean;
  created_at?: string | null;
}

export interface OwnerBooking {
  booking_id: number;
  station_id: number;
  station_name: string;
  connector_id: number;
  connector_label: string;
  driver_name: string;
  start_time: string;
  end_time: string;
  status: "CONFIRMED" | "CANCELLED" | "COMPLETED" | string;
}

export interface OwnerBookingListResponse {
  bookings: OwnerBooking[];
  total: number;
  page: number;
  page_size: number;
}

export interface EarningsTotals {
  estimated_revenue: number;
  estimated_energy_kwh: number;
  completed_bookings: number;
}

export interface EarningsTimeSeriesPoint {
  date: string;
  period?: string | null;
  estimated_revenue: number;
  estimated_energy_kwh: number;
  completed_bookings: number;
}

export interface StationEarningsBreakdown {
  station_id: number;
  station_name: string;
  estimated_revenue: number;
  estimated_energy_kwh: number;
  completed_bookings: number;
}

export interface OwnerEarningsResponse {
  estimated_revenue: number;
  estimated_energy_kwh: number;
  completed_bookings: number;
  totals: EarningsTotals;
  time_series: EarningsTimeSeriesPoint[];
  station_breakdown: StationEarningsBreakdown[];
}

export interface StationUtilization {
  station_id: number;
  station_name: string;
  utilization_percent: number;
  booked_hours: number;
  open_hours: number;
}

export interface OwnerDashboardResponse {
  total_stations: number;
  total_connectors: number;
  connectors_by_status: Record<string, number>;
  today_bookings_count: number;
  upcoming_bookings: OwnerBooking[];
  estimated_revenue_this_month: number;
  estimated_revenue_last_month: number;
  utilization_last_7_days: StationUtilization[];
}

export interface StationCreateInput {
  name: string;
  address?: string;
  city?: string;
  latitude: number;
  longitude: number;
  open_time?: string;
  close_time?: string;
  price_per_kwh?: number;
}

export interface StationUpdateInput {
  name?: string;
  address?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  open_time?: string;
  close_time?: string;
  price_per_kwh?: number;
}

export interface ConnectorCreateInput {
  label?: string;
  connector_type: string;
  power_kw: number;
  price_per_kwh?: number;
}

export interface ConnectorUpdateInput {
  label?: string;
  connector_type?: string;
  power_kw?: number;
  price_per_kwh?: number;
}

export interface BackendUser {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  city?: string | null;
  profile_image_url?: string | null;
  role?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Central Error Class
// ─────────────────────────────────────────────────────────────────────────────

export class OwnerApiError extends Error {
  public status: number;
  public fieldErrors: Record<string, string>;

  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "OwnerApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Request Handler
// ─────────────────────────────────────────────────────────────────────────────

async function ownerRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
  } = {}
): Promise<T> {
  const { method = "GET", body } = options;

  let token: string | null = null;
  if (typeof window !== "undefined") {
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      token = session?.access_token || null;
    } catch {
      // Failed to get session
    }
  }

  if (!token) {
    throw new OwnerApiError(401, "Please log in to access the Business Portal.");
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const cleanBase = API_BASE_URL.replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${cleanBase}${cleanPath}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new OwnerApiError(
      0,
      "Unable to reach the server. Please check your connection and retry."
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  let data: any = null;
  const text = await response.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    let message = "Request failed.";
    const fieldErrors: Record<string, string> = {};

    if (response.status === 401) {
      message = "Your session has expired. Please log in again.";
    } else if (response.status === 403) {
      message = "Business owner access required.";
    } else if (response.status === 409) {
      message = data?.detail || "Action blocked by an existing conflict.";
    } else if (response.status === 422) {
      if (Array.isArray(data?.detail)) {
        for (const item of data.detail) {
          const loc = item.loc || [];
          const field = loc[loc.length - 1];
          const msg = item.msg || "Invalid value";
          if (field) {
            fieldErrors[String(field)] = msg;
          }
        }
        message = data.detail[0]?.msg || "Validation error.";
      } else if (typeof data?.detail === "string") {
        message = data.detail;
      }
    } else if (data?.detail && typeof data.detail === "string") {
      message = data.detail;
    } else if (data?.error && typeof data.error === "string") {
      message = data.error;
    }

    throw new OwnerApiError(response.status, message, fieldErrors);
  }

  return data as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Owner API Methods
// ─────────────────────────────────────────────────────────────────────────────

export const ownerApi = {
  /**
   * Get the current user's profile from the backend to read real users.role.
   */
  async getMe(): Promise<BackendUser> {
    return ownerRequest<BackendUser>("/auth/me");
  },

  /**
   * GET /owner/dashboard
   */
  async getDashboard(): Promise<OwnerDashboardResponse> {
    return ownerRequest<OwnerDashboardResponse>("/owner/dashboard");
  },

  /**
   * GET /owner/stations
   */
  async getStations(page = 1, pageSize = 20): Promise<OwnerStationListResponse> {
    return ownerRequest<OwnerStationListResponse>(
      `/owner/stations?page=${page}&page_size=${pageSize}`
    );
  },

  async listStations(params: { page?: number; page_size?: number } = {}): Promise<OwnerStationListResponse> {
    const page = params.page ?? 1;
    const pageSize = params.page_size ?? 20;
    return ownerRequest<OwnerStationListResponse>(
      `/owner/stations?page=${page}&page_size=${pageSize}`
    );
  },

  /**
   * GET /owner/stations/{id}
   */
  async getStation(id: number): Promise<OwnerStation> {
    return ownerRequest<OwnerStation>(`/owner/stations/${id}`);
  },

  /**
   * POST /owner/stations
   */
  async createStation(payload: StationCreateInput): Promise<OwnerStation> {
    return ownerRequest<OwnerStation>("/owner/stations", {
      method: "POST",
      body: payload,
    });
  },

  /**
   * PUT /owner/stations/{id}
   */
  async updateStation(id: number, payload: StationUpdateInput): Promise<OwnerStation> {
    return ownerRequest<OwnerStation>(`/owner/stations/${id}`, {
      method: "PUT",
      body: payload,
    });
  },

  /**
   * DELETE /owner/stations/{id}
   */
  async deleteStation(id: number): Promise<{ message: string }> {
    return ownerRequest<{ message: string }>(`/owner/stations/${id}`, {
      method: "DELETE",
    });
  },

  /**
   * POST /owner/stations/{id}/connectors
   */
  async addConnector(
    stationId: number,
    payload: ConnectorCreateInput
  ): Promise<OwnerConnector> {
    return ownerRequest<OwnerConnector>(`/owner/stations/${stationId}/connectors`, {
      method: "POST",
      body: payload,
    });
  },

  /**
   * PUT /owner/connectors/{id}
   */
  async updateConnector(
    connectorId: number,
    payload: ConnectorUpdateInput
  ): Promise<OwnerConnector> {
    return ownerRequest<OwnerConnector>(`/owner/connectors/${connectorId}`, {
      method: "PUT",
      body: payload,
    });
  },

  /**
   * PATCH /owner/connectors/{id}/status
   * Only AVAILABLE, OFFLINE, or DISABLED allowed.
   */
  async patchConnectorStatus(
    connectorId: number,
    status: "AVAILABLE" | "OFFLINE" | "DISABLED"
  ): Promise<OwnerConnector> {
    return ownerRequest<OwnerConnector>(`/owner/connectors/${connectorId}/status`, {
      method: "PATCH",
      body: { status },
    });
  },

  /**
   * DELETE /owner/connectors/{id}
   */
  async deleteConnector(connectorId: number): Promise<{ message: string }> {
    return ownerRequest<{ message: string }>(`/owner/connectors/${connectorId}`, {
      method: "DELETE",
    });
  },

  /**
   * GET /owner/bookings
   */
  async getBookings(params: {
    station_id?: number;
    connector_id?: number;
    status?: string;
    date_from?: string;
    date_to?: string;
    page?: number;
    page_size?: number;
  } = {}): Promise<OwnerBookingListResponse> {
    const q = new URLSearchParams();
    if (params.station_id) q.set("station_id", String(params.station_id));
    if (params.connector_id) q.set("connector_id", String(params.connector_id));
    if (params.status && params.status !== "All") q.set("status", params.status);
    if (params.date_from) q.set("date_from", params.date_from);
    if (params.date_to) q.set("date_to", params.date_to);
    if (params.page) q.set("page", String(params.page));
    if (params.page_size) q.set("page_size", String(params.page_size));

    const qs = q.toString();
    return ownerRequest<OwnerBookingListResponse>(
      `/owner/bookings${qs ? `?${qs}` : ""}`
    );
  },

  /**
   * GET /owner/bookings/upcoming
   */
  async getUpcomingBookings(): Promise<OwnerBooking[]> {
    return ownerRequest<OwnerBooking[]>("/owner/bookings/upcoming");
  },

  /**
   * GET /owner/earnings
   */
  async getEarnings(params: {
    date_from?: string;
    date_to?: string;
    group_by?: "day" | "month";
    station_id?: number;
  } = {}): Promise<OwnerEarningsResponse> {
    const q = new URLSearchParams();
    if (params.date_from) q.set("date_from", params.date_from);
    if (params.date_to) q.set("date_to", params.date_to);
    if (params.group_by) q.set("group_by", params.group_by);
    if (params.station_id) q.set("station_id", String(params.station_id));

    const qs = q.toString();
    return ownerRequest<OwnerEarningsResponse>(
      `/owner/earnings${qs ? `?${qs}` : ""}`
    );
  },
};
