import { z } from 'zod';
import { paginationSchema, sortOrderSchema } from '../../utils/query';

export const challanStatusSchema = z.enum(['DRAFT', 'CONFIRMED', 'CANCELLED'], {
  errorMap: () => ({ message: 'Status must be DRAFT, CONFIRMED or CANCELLED' }),
});

const challanItemSchema = z.object({
  productId: z.string({ required_error: 'productId is required' }).trim().min(1, 'productId is required'),
  quantity: z.coerce
    .number({ required_error: 'Quantity is required' })
    .int('Quantity must be a whole number')
    .positive('Quantity must be greater than zero')
    .max(1_000_000, 'Quantity is too large'),
});

/**
 * Line items are merged by product before they reach the service, so a client
 * sending the same product twice gets one line with the combined quantity
 * rather than a unique-constraint violation.
 */
const itemsSchema = z
  .array(challanItemSchema)
  .min(1, 'A challan must contain at least one product')
  .max(200, 'A challan cannot contain more than 200 lines')
  .transform((items) => {
    const merged = new Map<string, number>();
    for (const item of items) {
      merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
    }
    return [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity }));
  });

export const createChallanSchema = z.object({
  customerId: z.string({ required_error: 'customerId is required' }).trim().min(1, 'customerId is required'),
  items: itemsSchema,
  notes: z.string().trim().max(2000).optional().nullable(),
  /**
   * Confirm immediately instead of saving a draft first. Stock is deducted in
   * the same transaction that creates the challan.
   */
  confirm: z.boolean().optional().default(false),
});

export const updateChallanSchema = z
  .object({
    customerId: z.string().trim().min(1).optional(),
    items: itemsSchema.optional(),
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });

export const cancelChallanSchema = z.object({
  reason: z
    .string({ required_error: 'A cancellation reason is required' })
    .trim()
    .min(3, 'Give a reason of at least 3 characters')
    .max(240),
});

export const listChallansQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  status: challanStatusSchema.optional(),
  customerId: z.string().trim().min(1).optional(),
  from: z.coerce.date({ invalid_type_error: '"from" must be a valid date' }).optional(),
  to: z.coerce.date({ invalid_type_error: '"to" must be a valid date' }).optional(),
  sortBy: z.enum(['createdAt', 'challanNumber', 'totalAmount', 'totalQuantity', 'status']).default('createdAt'),
  sortOrder: sortOrderSchema,
});

export type CreateChallanInput = z.infer<typeof createChallanSchema>;
export type UpdateChallanInput = z.infer<typeof updateChallanSchema>;
export type CancelChallanInput = z.infer<typeof cancelChallanSchema>;
export type ListChallansQuery = z.infer<typeof listChallansQuerySchema>;
