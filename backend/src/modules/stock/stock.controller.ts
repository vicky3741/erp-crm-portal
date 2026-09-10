import { asyncHandler } from '../../utils/asyncHandler';
import { ok, paginated } from '../../utils/response';
import * as stockService from './stock.service';
import type { ListStockMovementsQuery } from './stock.schema';

export const list = asyncHandler(async (req, res) => {
  const query = req.query as unknown as ListStockMovementsQuery;
  const { movements, meta } = await stockService.listStockMovements(query);
  return paginated(res, movements, meta);
});

export const summary = asyncHandler(async (_req, res) => {
  return ok(res, await stockService.getStockSummary());
});
