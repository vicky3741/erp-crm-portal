import axios from 'axios';

/**
 * Single axios instance used by every feature.
 *
 * In development VITE_API_URL is empty, so requests go to "/api/..." and Vite
 * proxies them to the backend — no CORS involved. In production it points at
 * the deployed backend origin.
 */
const baseURL = `${import.meta.env.VITE_API_URL ?? ''}/api`;

export const apiClient = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
});

const TOKEN_KEY = 'erp.token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    // Private windows and blocked site data throw rather than returning null.
    return null;
  }
}

export function setStoredToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable — the session simply won't survive a reload */
  }
}

/** Called by AuthContext so a 401 anywhere can clear the session once. */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

apiClient.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // An expired or revoked token should log the user out rather than leaving
    // them clicking through a UI where nothing works.
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const isLoginAttempt = error.config?.url?.includes('/auth/login');
      if (!isLoginAttempt) onUnauthorized?.();
    }
    return Promise.reject(error);
  },
);

export interface ApiResponse<T> {
  success: true;
  data: T;
  message?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface ApiListResponse<T> {
  success: true;
  data: T[];
  meta: PaginationMeta;
  message?: string;
}

export interface ApiErrorBody {
  success: false;
  message: string;
  details?: unknown;
}

/** Pulls a human-readable message out of any thrown request failure. */
export function getApiErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    if (error.response?.data?.message) return error.response.data.message;
    if (error.code === 'ECONNABORTED') return 'The request timed out. Please try again.';
    if (!error.response) return 'Cannot reach the server. Is the backend running?';
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** Field-level validation messages, when the API returned any. */
export function getApiFieldErrors(error: unknown): Array<{ field: string; message: string }> {
  if (!axios.isAxiosError<ApiErrorBody>(error)) return [];
  const details = error.response?.data?.details;
  if (!Array.isArray(details)) return [];
  return details.filter(
    (d): d is { field: string; message: string } =>
      typeof d === 'object' && d !== null && 'field' in d && 'message' in d,
  );
}

/** The insufficient-stock payload, when the API returned one. */
export function getInsufficientStock(error: unknown) {
  if (!axios.isAxiosError<ApiErrorBody>(error)) return null;
  const details = error.response?.data?.details as { insufficientStock?: unknown } | undefined;
  if (!details || !Array.isArray(details.insufficientStock)) return null;
  return details.insufficientStock as Array<{
    productId: string;
    productName: string;
    sku: string;
    requested: number;
    available: number;
    shortBy: number;
  }>;
}
