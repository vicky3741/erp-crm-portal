import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { created, ok, paginated } from '../../utils/response';
import * as challanService from './challan.service';
import type {
  CancelChallanInput,
  CreateChallanInput,
  ListChallansQuery,
  UpdateChallanInput,
} from './challan.schema';

function requireUser(req: { user?: { id: string } }) {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}

export const list = asyncHandler(async (req, res) => {
  const query = req.query as unknown as ListChallansQuery;
  const { challans, meta } = await challanService.listChallans(query);
  return paginated(res, challans, meta);
});

export const summary = asyncHandler(async (_req, res) => {
  return ok(res, await challanService.getChallanSummary());
});

export const getOne = asyncHandler(async (req, res) => {
  return ok(res, await challanService.getChallanById(req.params.id as string));
});

export const create = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const body = req.body as CreateChallanInput;
  const challan = await challanService.createChallan(body, user.id);

  return created(
    res,
    challan,
    body.confirm
      ? `Challan ${challan.challanNumber} created and confirmed. Stock has been deducted.`
      : `Challan ${challan.challanNumber} saved as a draft. Stock is unchanged until you confirm it.`,
  );
});

export const update = asyncHandler(async (req, res) => {
  const challan = await challanService.updateChallan(
    req.params.id as string,
    req.body as UpdateChallanInput,
  );
  return ok(res, challan, `Challan ${challan.challanNumber} updated`);
});

export const confirm = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const challan = await challanService.confirmChallan(req.params.id as string, user.id);
  return ok(res, challan, `Challan ${challan.challanNumber} confirmed. Stock has been deducted.`);
});

export const cancel = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const challan = await challanService.cancelChallan(
    req.params.id as string,
    req.body as CancelChallanInput,
    user.id,
  );
  return ok(res, challan, `Challan ${challan.challanNumber} cancelled. Any deducted stock has been returned.`);
});
