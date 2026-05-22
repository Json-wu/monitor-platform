"use client";

import { getToken } from "@/lib/auth";
import { ApiError, parseApiErrorMessages } from "@/lib/api-errors";

export {
  ApiError,
  formatApiErrorMessage,
  getErrorMessages,
  parseApiErrorMessages,
} from "@/lib/api-errors";
export { useShowApiError } from "@/lib/show-api-error";

/** 统一为 `.../api`，避免 env 漏写 `/api` 导致请求打到 `/audit-logs` 而 404 */
function getApiBase(): string {
  const raw = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000").replace(
    /\/+$/,
    "",
  );
  if (/\/api$/i.test(raw)) return raw;
  return `${raw}/api`;
}

const API_BASE = getApiBase();

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getToken()}`,
    "Content-Type": "application/json",
  };
}

async function parseJson<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    const msg = data?.message;
    throw new ApiError(parseApiErrorMessages(msg));
  }
  return data as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  return parseJson<T>(response);
}

export async function apiGetScoped<T>(path: string, appId: string): Promise<T> {
  if (!appId || appId === "undefined" || appId === "null") {
    throw new Error("Missing application context (appId).");
  }
  const sep = path.includes("?") ? "&" : "?";
  return apiGet<T>(`${path}${sep}appId=${encodeURIComponent(appId)}`);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return parseJson<T>(response);
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return parseJson<T>(response);
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return parseJson<T>(response);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return parseJson<T>(response);
}

export async function apiPostScoped<T>(
  path: string,
  body: Record<string, unknown>,
  appId: string,
): Promise<T> {
  return apiPost<T>(path, { ...body, appId });
}

export async function loginAdmin(email: string, password: string) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return parseJson<{ access_token: string }>(response);
}

/** Records server-side logout; ignores network/401 so client can always clear token. */
export async function apiLogoutSafe(): Promise<void> {
  try {
    await apiPost<{ ok?: boolean }>("/auth/logout", {});
  } catch {
    // ignore
  }
}
