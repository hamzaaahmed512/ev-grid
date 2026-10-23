/**
 * Centralized API client for EV Grid / VoltRelay frontend.
 * Reads base URL from NEXT_PUBLIC_API_URL env var.
 * Attaches Authorization: Bearer <token> when a token is stored.
 * Handles HTTP and network errors gracefully.
 */

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

// ── Token storage ──────────────────────────────────────────────────────────────
// Stored in memory for the current session + persisted in localStorage
// so the user stays logged in across page refreshes.
// We NEVER store passwords.

const TOKEN_KEY = "ev_grid_access_token";
const USER_KEY  = "ev_grid_user";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredUser(): ApiUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as ApiUser; } catch { return null; }
}

export function setStoredUser(user: ApiUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

// ── TypeScript types (matching real backend schemas) ──────────────────────────

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

/** Backend station shape — fields actually returned by /stations */
export interface ApiStation {
  id: number;
  name: string;
  city: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  price_per_kwh: number | null;
  created_at: string | null;
}

// ── API Error class ────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

// ── Core fetch wrapper ─────────────────────────────────────────────────────────

interface FetchOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** If true, will NOT attach the Authorization header even if a token exists */
  public?: boolean;
}

async function request<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const { method = "GET", body, public: isPublic = false } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (!isPublic) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
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
      "Unable to reach the API. Check your network and API URL; a CORS or server availability issue may also be blocking the request.",
    );
  }

  // Handle empty bodies (204 No Content, etc.)
  if (response.status === 204) return undefined as T;

  let data: unknown;
  try {
    const responseText = await response.text();
    data = JSON.parse(responseText);
  } catch {
    const message = response.status >= 500
      ? "The server could not complete this request. Please try again later."
      : "The API returned an invalid JSON response.";
    throw new ApiError(response.status, `HTTP ${response.status}: ${message}`);
  }

  if (!response.ok) {
    const errorObj = data as Record<string, unknown> | null;

    let message = response.status >= 500
      ? "The server could not complete this request. Please try again later."
      : "The request failed.";
    if (response.status < 500 && typeof errorObj?.detail === "string") {
      message = errorObj.detail;
    } else if (
      response.status < 500 &&
      Array.isArray(errorObj?.detail) &&
      errorObj.detail.length > 0
    ) {
      const first = errorObj.detail[0] as { msg?: string };
      if (first?.msg) message = first.msg;
    } else if (
      response.status < 500 &&
      errorObj?.detail &&
      typeof errorObj.detail === "object" &&
      !Array.isArray(errorObj.detail) &&
      "msg" in errorObj.detail &&
      typeof (errorObj.detail as { msg?: unknown }).msg === "string"
    ) {
      message = (errorObj.detail as { msg: string }).msg;
    } else if (response.status < 500 && typeof errorObj?.message === "string") {
      message = errorObj.message;
    } else if (
      response.status < 500 &&
      typeof errorObj?.error_description === "string"
    ) {
      message = errorObj.error_description;
    } else if (response.status < 500 && typeof errorObj?.error === "string") {
      message = errorObj.error;
    }

    throw new ApiError(response.status, `HTTP ${response.status}: ${message}`);
  }

  return data as T;
}

// ── Auth endpoints ─────────────────────────────────────────────────────────────

export const authApi = {
  google(credential: string): Promise<AuthResponse> {
    return request<AuthResponse>("/auth/google", {
      method: "POST",
      body: { credential },
      public: true,
    });
  },
  /**
   * POST /auth/signup
   * Body: { name, email, password }
   * Returns: { access_token, token_type, user }
   */
  signup(name: string, email: string, password: string): Promise<AuthResponse> {
    return request<AuthResponse>("/auth/signup", {
      method: "POST",
      body: { name, email, password },
      public: true,
    });
  },

  /**
   * POST /auth/login
   * Body: { email, password }
   * Returns: { access_token, token_type, user }
   */
  login(email: string, password: string): Promise<AuthResponse> {
    return request<AuthResponse>("/auth/login", {
      method: "POST",
      body: { email, password },
      public: true,
    });
  },

  /**
   * GET /auth/me  (protected)
   * Returns: { id, name, email, created_at }
   */
  me(): Promise<ApiUser> {
    return request<ApiUser>("/auth/me");
  },
};

// ── Station endpoints ──────────────────────────────────────────────────────────

export const stationApi = {
  /**
   * GET /stations  — returns all stations.
   * Supports optional city and status filters.
   */
  list(params?: { city?: string; status?: string }): Promise<ApiStation[]> {
    const qs = new URLSearchParams();
    if (params?.city)   qs.set("city", params.city);
    if (params?.status) qs.set("status", params.status);
    const query = qs.toString();
    return request<ApiStation[]>(`/stations${query ? `?${query}` : ""}`, {
      public: true,
    });
  },

  /**
   * GET /stations/:id
   */
  get(id: number): Promise<ApiStation> {
    return request<ApiStation>(`/stations/${id}`, { public: true });
  },
};

// ── Health check ───────────────────────────────────────────────────────────────

export const healthApi = {
  check(): Promise<{ status: string; project: string }> {
    return request("/health", { public: true });
  },
};
// ── Vehicle endpoints ──────────────────────────────────────────────────────────

export interface ApiVehicle {
  id: number;
  user_id: number;
  make: string;
  model: string;
  year: number;
  battery_capacity_kwh: number;
  connector_type: string;
  created_at: string;
  updated_at: string;
}

export interface VehicleCreateInput {
  make: string;
  model: string;
  year: number;
  battery_capacity_kwh: number;
  connector_type: string;
}

export interface VehicleUpdateInput {
  make?: string;
  model?: string;
  year?: number;
  battery_capacity_kwh?: number;
  connector_type?: string;
}

export const vehicleApi = {
  /**
   * GET /vehicles/ — List all vehicles owned by current user
   */
  list(): Promise<ApiVehicle[]> {
    return request<ApiVehicle[]>("/vehicles/");
  },

  /**
   * GET /vehicles/:id — Get vehicle by ID
   */
  get(id: number): Promise<ApiVehicle> {
    return request<ApiVehicle>(`/vehicles/${id}`);
  },

  /**
   * POST /vehicles/ — Register a new vehicle
   */
  create(data: VehicleCreateInput): Promise<ApiVehicle> {
    return request<ApiVehicle>("/vehicles/", {
      method: "POST",
      body: data,
    });
  },

  /**
   * PUT /vehicles/:id — Update existing vehicle
   */
  update(id: number, data: VehicleUpdateInput): Promise<ApiVehicle> {
    return request<ApiVehicle>(`/vehicles/${id}`, {
      method: "PUT",
      body: data,
    });
  },

  /**
   * DELETE /vehicles/:id — Delete a vehicle
   */
  delete(id: number): Promise<{ message: string; id?: number }> {
    return request<{ message: string; id?: number }>(`/vehicles/${id}`, {
      method: "DELETE",
    });
  },
};
