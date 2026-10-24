/**
 * Centralized API client for VoltRelay.
 * Base URL is read from NEXT_PUBLIC_API_URL environment variable.
 * Automatically attaches Authorization: Bearer <token> for protected requests.
 */

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

// ──────────────────────────────────────────────────────────────────────────────
// Token & User Storage
// ──────────────────────────────────────────────────────────────────────────────

const TOKEN_KEY = "ev_grid_access_token";
const USER_KEY = "ev_grid_user";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredUser(): ApiUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as ApiUser;
  } catch {
    return null;
  }
}

export function setStoredUser(user: ApiUser): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

// ──────────────────────────────────────────────────────────────────────────────
// Type Definitions
// ──────────────────────────────────────────────────────────────────────────────

export interface ApiUser {
  id: number;
  name: string;
  email: string;
  created_at: string;
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
  user_id: number;
  make: string;
  model: string;
  year: number;
  battery_capacity_kwh: number;
  battery_kwh?: number;
  connector_type: string;
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
}

export interface VehicleUpdateInput {
  make?: string;
  model?: string;
  year?: number;
  battery_capacity_kwh?: number;
  battery_kwh?: number;
  connector_type?: string;
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

  if (!isPublic) {
    const token = getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  let response: Response;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
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
    } else if (typeof errorObj?.error === "string") {
      message = errorObj.error;
    }

    throw new ApiError(response.status, message);
  }

  return data as T;
}

// ──────────────────────────────────────────────────────────────────────────────
// Authentication API
// ──────────────────────────────────────────────────────────────────────────────

export const authApi = {
  signup(name: string, email: string, password: string): Promise<AuthResponse> {
    return request<AuthResponse>("/auth/signup", {
      method: "POST",
      body: { name, email, password },
      public: true,
    });
  },

  login(email: string, password: string): Promise<AuthResponse> {
    return request<AuthResponse>("/auth/login", {
      method: "POST",
      body: { email, password },
      public: true,
    });
  },

  me(): Promise<ApiUser> {
    return request<ApiUser>("/auth/me");
  },

  google(credential: string): Promise<AuthResponse> {
    return request<AuthResponse>("/auth/google", {
      method: "POST",
      body: { credential },
      public: true,
    });
  },
};

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
      method: "PUT",
      body: payload,
    });
  },

  delete(id: number): Promise<{ message: string; deleted_id?: number }> {
    return request<{ message: string; deleted_id?: number }>(`/vehicles/${id}`, {
      method: "DELETE",
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