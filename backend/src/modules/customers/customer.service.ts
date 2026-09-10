import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import { buildPaginationMeta } from '../../utils/response';
import { normaliseSearch, toSkipTake, type PaginationQuery } from '../../utils/query';
import type {
  CreateCustomerInput,
  CreateFollowUpInput,
  ListCustomersQuery,
  UpdateCustomerInput,
} from './customer.schema';

/** Fields returned for a customer in list responses. */
const listSelect = {
  id: true,
  name: true,
  mobile: true,
  email: true,
  businessName: true,
  gstNumber: true,
  customerType: true,
  address: true,
  status: true,
  followUpDate: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CustomerSelect;

export async function listCustomers(query: ListCustomersQuery) {
  const { search, status, customerType, followUpDue, includeInactive, sortBy, sortOrder } = query;
  const term = normaliseSearch(search);

  const where: Prisma.CustomerWhereInput = {
    // Soft-deleted customers are hidden unless explicitly requested.
    ...(includeInactive ? {} : { isActive: true }),
    ...(status ? { status } : {}),
    ...(customerType ? { customerType } : {}),
    ...(followUpDue ? { followUpDate: { not: null, lte: new Date() } } : {}),
    ...(term
      ? {
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { mobile: { contains: term } },
            { email: { contains: term, mode: 'insensitive' } },
            { businessName: { contains: term, mode: 'insensitive' } },
            { gstNumber: { contains: term, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  // Rows and count run as one round trip rather than two sequential ones.
  const [customers, total] = await prisma.$transaction([
    prisma.customer.findMany({
      where,
      select: { ...listSelect, _count: { select: { followUps: true, challans: true } } },
      orderBy: { [sortBy]: sortOrder },
      ...toSkipTake(query),
    }),
    prisma.customer.count({ where }),
  ]);

  return { customers, meta: buildPaginationMeta(query.page, query.limit, total) };
}

export async function getCustomerById(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: {
      ...listSelect,
      notes: true,
      createdBy: { select: { id: true, name: true, role: true } },
      followUps: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          note: true,
          followUpDate: true,
          createdAt: true,
          createdBy: { select: { id: true, name: true, role: true } },
        },
      },
      challans: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          challanNumber: true,
          status: true,
          totalQuantity: true,
          totalAmount: true,
          createdAt: true,
        },
      },
      _count: { select: { followUps: true, challans: true } },
    },
  });

  if (!customer) throw AppError.notFound('Customer not found');

  return customer;
}

/**
 * Mobile is the practical identity of a customer in this business, so a
 * duplicate is rejected rather than silently creating a second record. The
 * database also carries a unique index, which is what actually guarantees it
 * under concurrency; this check exists to return a helpful message instead of
 * a bare constraint violation.
 */
async function assertMobileIsFree(mobile: string, excludeId?: string) {
  const existing = await prisma.customer.findFirst({
    where: { mobile, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, name: true, businessName: true, isActive: true },
  });

  if (existing) {
    throw AppError.conflict(
      `Mobile number ${mobile} already belongs to ${existing.name} (${existing.businessName})` +
        (existing.isActive ? '' : ' — that customer is deactivated'),
      { conflictingCustomerId: existing.id },
    );
  }
}

export async function createCustomer(input: CreateCustomerInput, createdById: string) {
  await assertMobileIsFree(input.mobile);

  return prisma.customer.create({
    data: { ...input, createdById },
    select: listSelect,
  });
}

export async function updateCustomer(id: string, input: UpdateCustomerInput) {
  const existing = await prisma.customer.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound('Customer not found');

  if (input.mobile) await assertMobileIsFree(input.mobile, id);

  return prisma.customer.update({
    where: { id },
    data: input,
    select: listSelect,
  });
}

/**
 * Soft delete. Customers are referenced by challans and follow-ups, so the row
 * has to survive; deactivating hides it from the default list while keeping
 * every historical document intact and readable.
 */
export async function deactivateCustomer(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, isActive: true },
  });

  if (!customer) throw AppError.notFound('Customer not found');
  if (!customer.isActive) throw AppError.conflict('This customer is already deactivated');

  return prisma.customer.update({
    where: { id },
    data: { isActive: false, status: 'INACTIVE' },
    select: listSelect,
  });
}

export async function reactivateCustomer(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, isActive: true },
  });

  if (!customer) throw AppError.notFound('Customer not found');
  if (customer.isActive) throw AppError.conflict('This customer is already active');

  return prisma.customer.update({
    where: { id },
    data: { isActive: true, status: 'ACTIVE' },
    select: listSelect,
  });
}

/**
 * Adding a note optionally reschedules the customer's next follow-up date, so
 * "called them, ring back Friday" is a single request rather than two.
 */
export async function addFollowUp(customerId: string, input: CreateFollowUpInput, createdById: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, isActive: true },
  });

  if (!customer) throw AppError.notFound('Customer not found');
  if (!customer.isActive) throw AppError.conflict('Cannot add a follow-up to a deactivated customer');

  const [followUp] = await prisma.$transaction([
    prisma.followUp.create({
      data: { customerId, note: input.note, followUpDate: input.followUpDate ?? null, createdById },
      select: {
        id: true,
        note: true,
        followUpDate: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true, role: true } },
      },
    }),
    ...(input.followUpDate !== undefined
      ? [
          prisma.customer.update({
            where: { id: customerId },
            data: { followUpDate: input.followUpDate },
            select: { id: true },
          }),
        ]
      : []),
  ]);

  return followUp;
}

export async function listFollowUps(customerId: string, pagination: PaginationQuery) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
  if (!customer) throw AppError.notFound('Customer not found');

  const [followUps, total] = await prisma.$transaction([
    prisma.followUp.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        note: true,
        followUpDate: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true, role: true } },
      },
      ...toSkipTake(pagination),
    }),
    prisma.followUp.count({ where: { customerId } }),
  ]);

  return { followUps, meta: buildPaginationMeta(pagination.page, pagination.limit, total) };
}

/** Counts used by the dashboard. */
export async function getCustomerSummary() {
  const [total, leads, active, inactive, followUpsDue] = await prisma.$transaction([
    prisma.customer.count({ where: { isActive: true } }),
    prisma.customer.count({ where: { isActive: true, status: 'LEAD' } }),
    prisma.customer.count({ where: { isActive: true, status: 'ACTIVE' } }),
    prisma.customer.count({ where: { isActive: false } }),
    prisma.customer.count({ where: { isActive: true, followUpDate: { not: null, lte: new Date() } } }),
  ]);

  return { total, leads, active, inactive, followUpsDue };
}
