import axios from 'axios';

/**
 * Single axios instance used by every feature.
 *
 * In development VITE_API_URL is left empty so requests go to "/api/..." and are
 * proxied to the backend by Vite (see vite.config.ts) — no CORS involved.
 * In production VITE_API_URL points at the deployed backend origin.
 */
const baseURL = `${import.meta.env.VITE_API_URL ?? ''}/api`;

export const apiClient = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20_000,
});

/** Shape every endpoint in this API responds with. */
export interface ApiResponse<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiListResponse<T> extends ApiResponse<T[]> {
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface ApiErrorBody {
  success: false;
  message: string;
  details?: Array<{ field: string; message: string }> | unknown;
}

/** Pull a human-readable message out of any thrown request failure. */
export function getApiErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    if (error.response?.data?.message) return error.response.data.message;
    if (error.code === 'ECONNABORTED') return 'Request timed out. Please try again.';
    if (!error.response) return 'Cannot reach the server. Is the backend running?';
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
