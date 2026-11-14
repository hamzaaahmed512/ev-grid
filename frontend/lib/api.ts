/**
 * Centralized API client for VoltRelay.
 * Uses native Supabase authentication sessions & cookies.
 * Automatically attaches Authorization: Bearer <token> for protected requests if available.
 */

import { createClient } from "./supabase/client";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL !== undefined
    ? process.env.NEXT_PUBLIC_API_URL
    : "";

// ──────────────────────────────────────────────────────────────────────────────
// Token & User Storage Compatibility Stubs (Deprecated: Supabase manages cookies)
// ──────────────────────────────────────────────────────────────────────────────

export function getToken(): string | null {
  return null;
}

export function setToken(_token: string): void {
  // Handled automatically by Supabase session cookies
}

export function clearToken(): void {
  // Handled automatically by Supabase signOut
}

export function getStoredUser(): ApiUser | null {
  return null;
}

export function setStoredUser(_user: ApiUser): void {
  // Handled automatically by Supabase session
}

// ──────────────────────────────────────────────────────────────────────────────
// Type Definitions
// ──────────────────────────────────────────────────────────────────────────────

export interface ApiUser {
  id: number | string;
  name: string;
  email: string;
  phone?: string | null;
  city?: string | null;
  profile_image_url?: string | null;
  role?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface UserProfileUpdateInput {
  name?: string;
  phone?: string | null;
  city?: string | null;
  profile_image_url?: string | null;
}

export interface AuthResponse {
  access_token: string;
  token_type: "bearer";
  user: ApiUser;
}

export interface ApiConnector {
  id: number;
  connector_type: string;
  max_power_kw: number;
  price_per_kwh: number;
  status: string;
}

export interface ApiStation {
  id: number;
  name: string;
  city: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  price_per_kwh: number | null;
  is_compatible?: boolean;
  connectors?: ApiConnector[];
  created_at: string | null;
}

export interface CompatibleVehicle {
  id: number;
  name: string;
  year: number;
  connector_type: string;
  battery_capacity_kwh?: number | null;
  battery_kwh?: number | null;
}

export interface CompatibleStationsResponse {
  vehicle: CompatibleVehicle;
  total_compatible: number;
  stations: ApiStation[];
}

export interface ApiVehicle {
  id: number;
  user_id: number | string;
  make: string;
  model: string;
  year: number;
  battery_capacity_kwh: number;
  battery_kwh?: number;
  connector_type: string;
  max_power_kw?: number | null;
  nickname?: string | null;
  range_km?: number | null;
  color?: string | null;
  license_plate?: string | null;
  is_primary?: boolean;
  created_at: string;
  updated_at: string;
}

export interface VehicleCreateInput {
  make: string;
  model: string;
  year: number;
  battery_capacity_kwh: number;
  battery_kwh?: number;
  connector_type: string;
  max_power_kw?: number | null;
  nickname?: string | null;
  range_km?: number | null;
  color?: string | null;
  license_plate?: string | null;
  is_primary?: boolean;
}

export interface VehicleUpdateInput {
  make?: string;
  model?: string;
  year?: number;
  battery_capacity_kwh?: number;
  battery_kwh?: number;
  connector_type?: string;
  max_power_kw?: number | null;
  nickname?: string | null;
  range_km?: number | null;
  color?: string | null;
  license_plate?: string | null;
  is_primary?: boolean;
}

// ─── Booking Types (Module 4 & 5) ────────────────────────────────────────────
export type BookingStatus = "CONFIRMED" | "CANCELLED" | "COMPLETED" | "IN_PROGRESS";

export interface ApiBookingVehicle {
  id: number;
  name: string;
  connector_type: string;
}

export interface ApiBookingStation {
  id: number;
  name: string;
  city?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface ApiBookingConnector {
  id: number;
  connector_type: string;
  max_power_kw: number;
  price_per_kwh: number;
}

export interface ApiBooking {
  id: number;
  status: BookingStatus;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  vehicle: ApiBookingVehicle;
  station: ApiBookingStation;
  connector: ApiBookingConnector;
  created_at?: string | null;
}

export interface BookingCreateInput {
  vehicle_id: number;
  connector_id: number;
  start_time: string;
  duration_minutes: number;
}

// ─── Charging Session & Live Types (Module 5) ───────────────────────────────
export interface ApiChargingSession {
  id: number;
  connector_id: number;
  booking_id?: number | null;
  user_id?: number | string | null;
  status: "ACTIVE" | "COMPLETED" | "FAULTED";
  started_at: string;
  ended_at?: string | null;
  duration_minutes?: number;
  soc_start?: number | null;
  soc_end?: number | null;
  kwh_delivered: number;
  peak_power_kw: number;
  cost: number;
  stop_reason?: string | null;
  station_name?: string | null;
  connector_type?: string | null;
}

export interface ApiActiveSessionSummary {
  session_id: number;
  started_at: string;
  duration_minutes: number;
  kwh_delivered: number;
  current_power_kw: number;
  soc?: number | null;
  cost: number;
}

export interface ApiConnectorLive {
  connector_id: number;
  station_id: number;
  charger_id?: string | null;
  status: string;
  current_power_kw: number;
  last_seen?: string | null;
  active_session?: ApiActiveSessionSummary | null;
}

export interface ApiLiveEvent {
  event: "connector_status" | "session_meter" | "booking_status";
  connector_id?: number;
  station_id?: number;
  status?: string;
  power_kw?: number;
  ts?: string;
  session_id?: number;
  kwh?: number;
  soc?: number;
  cost?: number;
  booking_id?: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// API Error
// ──────────────────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  public status: number;
  public detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Core Request Handler
// ──────────────────────────────────────────────────────────────────────────────

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  public?: boolean;
}

async function request<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body, public: isPublic = false } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (!isPublic && typeof window !== "undefined") {
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
    } catch {
      // Session lookup failed, continue with standard cookies
    }
  }

  let response: Response;
  const url =
    path.startsWith("http://") || path.startsWith("https://")
      ? path
      : `${BASE_URL}${path}`;

  try {
    response = await fetch(url, {
      method,
      headers,
      credentials: "include",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(
      0,
      "Unable to reach the API. Please check your internet connection or server status."
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  let data: unknown;

  try {
    const text = await response.text();
    data = JSON.parse(text);
  } catch {
    const message =
      response.status >= 500
        ? "The server could not complete this request. Please try again later."
        : "The API returned an invalid JSON response.";

    throw new ApiError(response.status, message);
  }

  if (!response.ok) {
    const errorObj = data as Record<string, unknown> | null;
    let message = "The request failed.";

    if (typeof errorObj?.detail === "string") {
      message = errorObj.detail;
    } else if (typeof errorObj?.error === "string") {
      message = errorObj.error;
    } else if (
      Array.isArray(errorObj?.detail) &&
      errorObj.detail.length > 0
    ) {
      const firstError = errorObj.detail[0] as { msg?: string };
      if (firstError?.msg) {
        message = firstError.msg;
      }
    } else if (
      errorObj?.detail &&
      typeof errorObj.detail === "object" &&
      !Array.isArray(errorObj.detail) &&
      "msg" in errorObj.detail
    ) {
      const detailMsg = (errorObj.detail as { msg?: unknown }).msg;
      if (typeof detailMsg === "string") {
        message = detailMsg;
      }
    } else if (typeof errorObj?.message === "string") {
      message = errorObj.message;
    }

    throw new ApiError(response.status, message);
  }

  return data as T;
}

// ──────────────────────────────────────────────────────────────────────────────
// Authentication API
// ──────────────────────────────────────────────────────────────────────────────

export const authApi = {
  signup(_name: string, _email: string, _password: string): Promise<AuthResponse> {
    throw new Error("Use useAuth().signup() for native Supabase authentication");
  },

  login(_email: string, _password: string): Promise<AuthResponse> {
    throw new Error("Use useAuth().login() for native Supabase authentication");
  },

  async me(): Promise<ApiUser> {
    if (typeof window !== "undefined") {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new ApiError(401, "Not authenticated");
      }

      const metadata = user.user_metadata || {};
      return {
        id: user.id,
        name: metadata.full_name || metadata.name || user.email?.split("@")[0] || "EV Driver",
        email: user.email || "",
        phone: user.phone || metadata.phone || null,
        city: metadata.city || null,
        profile_image_url: metadata.avatar_url || metadata.picture || null,
        role: metadata.role || "driver",
        created_at: user.created_at,
        updated_at: user.updated_at || null,
      };
    }

    return request<ApiUser>("/auth/me");
  },

  async updateProfile(data: UserProfileUpdateInput): Promise<ApiUser> {
    if (typeof window !== "undefined") {
      const supabase = createClient();
      const updates: Record<string, unknown> = {};
      if (data.name !== undefined) updates.full_name = data.name;
      if (data.phone !== undefined) updates.phone = data.phone;
      if (data.city !== undefined) updates.city = data.city;
      if (data.profile_image_url !== undefined) updates.avatar_url = data.profile_image_url;

      const { data: updated, error } = await supabase.auth.updateUser({
        data: updates,
      });

      if (error) {
        throw new ApiError(400, error.message);
      }

      const metadata = updated.user.user_metadata || {};
      return {
        id: updated.user.id,
        name: metadata.full_name || metadata.name || updated.user.email?.split("@")[0] || "EV Driver",
        email: updated.user.email || "",
        phone: updated.user.phone || metadata.phone || null,
        city: metadata.city || null,
        profile_image_url: metadata.avatar_url || metadata.picture || null,
        role: metadata.role || "driver",
        created_at: updated.user.created_at,
        updated_at: updated.user.updated_at || null,
      };
    }

    return request<ApiUser>("/auth/profile", {
      method: "PATCH",
      body: data,
    });
  },

  google(_credential: string): Promise<AuthResponse> {
    throw new Error("Use useAuth().googleLogin() for native Supabase Google OAuth");
  },
};

export const getProfile = () => authApi.me();
export const updateProfile = (data: UserProfileUpdateInput) => authApi.updateProfile(data);

// ──────────────────────────────────────────────────────────────────────────────
// Stations API
// ──────────────────────────────────────────────────────────────────────────────

export const stationApi = {
  list(params?: { city?: string; status?: string }): Promise<ApiStation[]> {
    const queryParams = new URLSearchParams();

    if (params?.city) {
      queryParams.set("city", params.city);
    }

    if (params?.status) {
      queryParams.set("status", params.status);
    }

    const queryString = queryParams.toString();
    const url = queryString ? `/stations/?${queryString}` : "/stations/";

    return request<ApiStation[]>(url, {
      public: true,
    });
  },

  get(id: number): Promise<ApiStation> {
    return request<ApiStation>(`/stations/${id}`, {
      public: true,
    });
  },

  compatible(vehicleId: number): Promise<CompatibleStationsResponse> {
    return request<CompatibleStationsResponse>(
      `/stations/compatible?vehicle_id=${vehicleId}`
    );
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Vehicles API
// ──────────────────────────────────────────────────────────────────────────────

export const vehicleApi = {
  list(): Promise<ApiVehicle[]> {
    return request<ApiVehicle[]>("/vehicles/");
  },

  getPrimary(): Promise<ApiVehicle> {
    return request<ApiVehicle>("/vehicles/primary");
  },

  get(id: number): Promise<ApiVehicle> {
    return request<ApiVehicle>(`/vehicles/${id}`);
  },

  create(data: VehicleCreateInput): Promise<ApiVehicle> {
    const payload = {
      ...data,
      battery_capacity_kwh: data.battery_capacity_kwh ?? data.battery_kwh,
    };
    return request<ApiVehicle>("/vehicles/", {
      method: "POST",
      body: payload,
    });
  },

  update(id: number, data: VehicleUpdateInput): Promise<ApiVehicle> {
    const payload = {
      ...data,
      ...(data.battery_capacity_kwh !== undefined || data.battery_kwh !== undefined
        ? { battery_capacity_kwh: data.battery_capacity_kwh ?? data.battery_kwh }
        : {}),
    };
    return request<ApiVehicle>(`/vehicles/${id}`, {
      method: "PATCH",
      body: payload,
    });
  },

  setPrimary(id: number): Promise<ApiVehicle> {
    return request<ApiVehicle>(`/vehicles/${id}/set-primary`, {
      method: "PATCH",
    });
  },

  delete(id: number): Promise<void> {
    return request<void>(`/vehicles/${id}`, {
      method: "DELETE",
    });
  },
};

export const getVehicles = () => vehicleApi.list();
export const getPrimaryVehicle = () => vehicleApi.getPrimary();
export const createVehicle = (data: VehicleCreateInput) => vehicleApi.create(data);
export const updateVehicle = (id: number, data: VehicleUpdateInput) => vehicleApi.update(id, data);
export const setPrimaryVehicle = (id: number) => vehicleApi.setPrimary(id);
export const deleteVehicle = (id: number) => vehicleApi.delete(id);

// ──────────────────────────────────────────────────────────────────────────────
// Bookings API (Module 4)
// ──────────────────────────────────────────────────────────────────────────────

export const bookingApi = {
  async list(status?: BookingStatus): Promise<ApiBooking[]> {
    const q = status ? `?status=${status}` : "";
    const data = await request<{ count: number; bookings: ApiBooking[] }>(`/bookings/${q}`);
    return data?.bookings ?? [];
  },
  create(data: BookingCreateInput): Promise<ApiBooking> {
    return request<ApiBooking>("/bookings/", { method: "POST", body: data });
  },
  cancel(id: number): Promise<ApiBooking> {
    return request<ApiBooking>(`/bookings/${id}/cancel`, { method: "PUT" });
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Sessions & Connectors Live API (Module 5)
// ──────────────────────────────────────────────────────────────────────────────

export const sessionApi = {
  async me(skip = 0, limit = 50): Promise<ApiChargingSession[]> {
    const data = await request<{ count: number; sessions: ApiChargingSession[] }>(
      `/sessions/me?skip=${skip}&limit=${limit}`
    );
    return data?.sessions ?? [];
  },

  get(id: number): Promise<ApiChargingSession> {
    return request<ApiChargingSession>(`/sessions/${id}`);
  },

  stop(id: number): Promise<{ ok: boolean; session_id: number; message: string }> {
    return request<{ ok: boolean; session_id: number; message: string }>(
      `/sessions/${id}/stop`,
      { method: "POST" }
    );
  },
};

export const connectorApi = {
  live(id: number): Promise<ApiConnectorLive> {
    return request<ApiConnectorLive>(`/connectors/${id}/live`, {
      public: true,
    });
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Health API
// ──────────────────────────────────────────────────────────────────────────────

export const healthApi = {
  check(): Promise<{ status: string; project: string }> {
    return request<{ status: string; project: string }>("/health", {
      public: true,
    });
  },
};
