import { z } from 'zod';
import { paginationSchema, sortOrderSchema } from '../../utils/query';

/** Indian mobile numbers: ten digits starting 6-9. */
const mobileSchema = z
  .string({ required_error: 'Mobile number is required' })
  .trim()
  .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number');

/**
 * GSTIN: 2-digit state code, 10-character PAN, entity number, "Z", checksum.
 * Optional per the spec — leads often have no GST registration yet.
 */
const gstSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}Z[A-Z\d]{1}$/,
    'Enter a valid 15-character GST number, e.g. 27AABCP1234C1ZV',
  );

export const customerTypeSchema = z.enum(['RETAIL', 'WHOLESALE', 'DISTRIBUTOR'], {
  errorMap: () => ({ message: 'Customer type must be RETAIL, WHOLESALE or DISTRIBUTOR' }),
});

export const customerStatusSchema = z.enum(['LEAD', 'ACTIVE', 'INACTIVE'], {
  errorMap: () => ({ message: 'Status must be LEAD, ACTIVE or INACTIVE' }),
});

export const createCustomerSchema = z.object({
  name: z.string({ required_error: 'Customer name is required' }).trim().min(2, 'Name must be at least 2 characters').max(120),
  mobile: mobileSchema,
  email: z.string({ required_error: 'Email is required' }).trim().toLowerCase().email('Enter a valid email address'),
  businessName: z
    .string({ required_error: 'Business name is required' })
    .trim()
    .min(2, 'Business name must be at least 2 characters')
    .max(160),
  gstNumber: gstSchema.optional().nullable(),
  customerType: customerTypeSchema,
  address: z.string({ required_error: 'Address is required' }).trim().min(5, 'Address must be at least 5 characters').max(400),
  status: customerStatusSchema.default('LEAD'),
  // Accepts "2026-09-20" or a full ISO timestamp.
  followUpDate: z.coerce.date({ invalid_type_error: 'Follow-up date must be a valid date' }).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

/**
 * Update is the create shape with everything optional, minus defaults — a
 * PATCH must not silently reset `status` to LEAD just because the field was
 * omitted. At least one field has to be present.
 */
export const updateCustomerSchema = createCustomerSchema
  .omit({ status: true })
  .extend({ status: customerStatusSchema })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });

export const listCustomersQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  status: customerStatusSchema.optional(),
  customerType: customerTypeSchema.optional(),
  /** "true" returns only customers whose follow-up date has arrived or passed. */
  followUpDue: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  sortBy: z.enum(['createdAt', 'name', 'followUpDate', 'status']).default('createdAt'),
  sortOrder: sortOrderSchema,
});

export const createFollowUpSchema = z.object({
  note: z.string({ required_error: 'Note is required' }).trim().min(3, 'Note must be at least 3 characters').max(2000),
  /** Optionally reschedules the customer's next follow-up in the same call. */
  followUpDate: z.coerce.date({ invalid_type_error: 'Follow-up date must be a valid date' }).optional().nullable(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type CreateFollowUpInput = z.infer<typeof createFollowUpSchema>;
