import { z } from 'zod';

/**
 * Shared query-string building blocks.
 *
 * Query values always arrive as strings, so every numeric field uses
 * `z.coerce`. `limit` is capped so a client cannot ask for the entire table
 * in one request.
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1, 'page must be 1 or greater').default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1, 'limit must be 1 or greater')
    .max(100, 'limit cannot exceed 100')
    .default(10),
});

export const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');

export type PaginationQuery = z.infer<typeof paginationSchema>;

/** Converts a validated page/limit pair into Prisma's skip/take. */
export function toSkipTake({ page, limit }: PaginationQuery) {
  return { skip: (page - 1) * limit, take: limit };
}

/**
 * Trims a search term and returns undefined when nothing useful is left, so
 * callers can drop the filter entirely rather than searching for an empty
 * string (which would match every row).
 */
export function normaliseSearch(search: string | undefined): string | undefined {
  const trimmed = search?.trim();
  return trimmed ? trimmed : undefined;
}

/** Route params that are a single id. */
export const idParamSchema = z.object({
  id: z.string().min(1, 'id is required'),
});
