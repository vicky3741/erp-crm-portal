import { z } from 'zod';
import { paginationSchema, sortOrderSchema } from '../../utils/query';

/**
 * Money arrives as a number or a numeric string and is stored as
 * Decimal(12,2). More than two decimal places is rejected rather than
 * silently rounded — a price of 12.999 is a mistake worth surfacing.
 */
const priceSchema = z.coerce
  .number({ required_error: 'Unit price is required', invalid_type_error: 'Unit price must be a number' })
  .nonnegative('Unit price cannot be negative')
  .max(9_999_999.99, 'Unit price is too large')
  .refine((n) => Number.isInteger(Math.round(n * 100)) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, {
    message: 'Unit price cannot have more than 2 decimal places',
  });

/** SKUs are uppercased so lookups and duplicate checks are case-insensitive. */
const skuSchema = z
  .string({ required_error: 'SKU is required' })
  .trim()
  .toUpperCase()
  .min(2, 'SKU must be at least 2 characters')
  .max(40, 'SKU cannot exceed 40 characters')
  .regex(/^[A-Z0-9][A-Z0-9-_]*$/, 'SKU may contain only letters, numbers, hyphens and underscores');

export const createProductSchema = z.object({
  name: z.string({ required_error: 'Product name is required' }).trim().min(2, 'Name must be at least 2 characters').max(160),
  sku: skuSchema,
  category: z.string({ required_error: 'Category is required' }).trim().min(2, 'Category must be at least 2 characters').max(80),
  unitPrice: priceSchema,
  /** Opening stock. Recorded as an auditable IN movement, never a bare number. */
  openingStock: z.coerce.number().int('Opening stock must be a whole number').nonnegative().max(1_000_000).default(0),
  minStockAlert: z.coerce.number().int('Minimum stock alert must be a whole number').nonnegative().max(1_000_000).default(0),
  location: z.string({ required_error: 'Location is required' }).trim().min(2).max(120),
});

/**
 * currentStock is deliberately NOT updatable here. Stock only ever changes
 * through a stock movement, so that the movement log and the stock level can
 * never disagree.
 */
export const updateProductSchema = createProductSchema
  .omit({ openingStock: true })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });

export const listProductsQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  category: z.string().trim().max(80).optional(),
  /** "true" returns only products at or below their alert level. */
  lowStock: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  sortBy: z.enum(['createdAt', 'name', 'sku', 'currentStock', 'unitPrice', 'category']).default('createdAt'),
  sortOrder: sortOrderSchema,
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
