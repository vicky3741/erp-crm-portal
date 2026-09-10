import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { created, ok, paginated } from '../../utils/response';
import type { PaginationQuery } from '../../utils/query';
import * as customerService from './customer.service';
import type {
  CreateCustomerInput,
  CreateFollowUpInput,
  ListCustomersQuery,
  UpdateCustomerInput,
} from './customer.schema';

function requireUser(req: { user?: { id: string } }) {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}

export const list = asyncHandler(async (req, res) => {
  const query = req.query as unknown as ListCustomersQuery;
  const { customers, meta } = await customerService.listCustomers(query);
  return paginated(res, customers, meta);
});

export const summary = asyncHandler(async (_req, res) => {
  return ok(res, await customerService.getCustomerSummary());
});

export const getOne = asyncHandler(async (req, res) => {
  return ok(res, await customerService.getCustomerById(req.params.id as string));
});

export const create = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const customer = await customerService.createCustomer(req.body as CreateCustomerInput, user.id);
  return created(res, customer, 'Customer created successfully');
});

export const update = asyncHandler(async (req, res) => {
  const customer = await customerService.updateCustomer(
    req.params.id as string,
    req.body as UpdateCustomerInput,
  );
  return ok(res, customer, 'Customer updated successfully');
});

export const deactivate = asyncHandler(async (req, res) => {
  const customer = await customerService.deactivateCustomer(req.params.id as string);
  return ok(res, customer, 'Customer deactivated. Their history remains intact.');
});

export const reactivate = asyncHandler(async (req, res) => {
  const customer = await customerService.reactivateCustomer(req.params.id as string);
  return ok(res, customer, 'Customer reactivated');
});

export const addFollowUp = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const followUp = await customerService.addFollowUp(
    req.params.id as string,
    req.body as CreateFollowUpInput,
    user.id,
  );
  return created(res, followUp, 'Follow-up note added');
});

export const listFollowUps = asyncHandler(async (req, res) => {
  const pagination = req.query as unknown as PaginationQuery;
  const { followUps, meta } = await customerService.listFollowUps(req.params.id as string, pagination);
  return paginated(res, followUps, meta);
});
