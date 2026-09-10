import type { Response } from 'express';

/**
 * Every successful response in this API has the same shape:
 *   { success: true, data: ..., meta?: ..., message?: ... }
 * Every failure has:
 *   { success: false, message: ..., details?: ... }
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

export function ok<T>(res: Response, data: T, message?: string) {
  return res.status(200).json({ success: true, data, ...(message ? { message } : {}) });
}

export function created<T>(res: Response, data: T, message?: string) {
  return res.status(201).json({ success: true, data, ...(message ? { message } : {}) });
}

export function paginated<T>(res: Response, data: T[], meta: PaginationMeta, message?: string) {
  return res.status(200).json({ success: true, data, meta, ...(message ? { message } : {}) });
}

export function noContent(res: Response) {
  return res.status(204).send();
}
