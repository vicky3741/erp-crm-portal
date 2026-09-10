import { z } from 'zod';
import { paginationSchema, sortOrderSchema } from '../../utils/query';

export const movementTypeSchema = z.enum(['IN', 'OUT'], {
  errorMap: () => ({ message: 'Movement type must be IN or OUT' }),
});

export const adjustStockSchema = z.object({
  quantity: z.coerce
    .number({ required_error: 'Quantity is required' })
    .int('Quantity must be a whole number')
    .positive('Quantity must be greater than zero')
    .max(1_000_000, 'Quantity is too large'),
  movementType: movementTypeSchema,
  /** Required: an unexplained stock change is useless in an audit. */
  reason: z
    .string({ required_error: 'Reason is required' })
    .trim()
    .min(3, 'Give a reason of at least 3 characters')
    .max(240),
});

export const listStockMovementsQuerySchema = paginationSchema.extend({
  productId: z.string().trim().min(1).optional(),
  movementType: movementTypeSchema.optional(),
  referenceType: z.string().trim().max(40).optional(),
  from: z.coerce.date({ invalid_type_error: '"from" must be a valid date' }).optional(),
  to: z.coerce.date({ invalid_type_error: '"to" must be a valid date' }).optional(),
  sortOrder: sortOrderSchema,
});

export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type ListStockMovementsQuery = z.infer<typeof listStockMovementsQuerySchema>;
