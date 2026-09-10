import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { created, ok, paginated } from '../../utils/response';
import * as productService from './product.service';
import type { CreateProductInput, ListProductsQuery, UpdateProductInput } from './product.schema';
import type { AdjustStockInput } from '../stock/stock.schema';

function requireUser(req: { user?: { id: string } }) {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}

export const list = asyncHandler(async (req, res) => {
  const query = req.query as unknown as ListProductsQuery;
  const { products, meta } = await productService.listProducts(query);
  return paginated(res, products, meta);
});

export const summary = asyncHandler(async (_req, res) => {
  return ok(res, await productService.getProductSummary());
});

export const lowStock = asyncHandler(async (_req, res) => {
  return ok(res, await productService.listLowStockProducts());
});

export const categories = asyncHandler(async (_req, res) => {
  return ok(res, await productService.listCategories());
});

export const getOne = asyncHandler(async (req, res) => {
  return ok(res, await productService.getProductById(req.params.id as string));
});

export const create = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const product = await productService.createProduct(req.body as CreateProductInput, user.id);
  return created(res, product, 'Product created successfully');
});

export const update = asyncHandler(async (req, res) => {
  const product = await productService.updateProduct(
    req.params.id as string,
    req.body as UpdateProductInput,
  );
  return ok(res, product, 'Product updated successfully');
});

export const deactivate = asyncHandler(async (req, res) => {
  const product = await productService.deactivateProduct(req.params.id as string);
  return ok(res, product, 'Product deactivated. Its stock history remains intact.');
});

export const reactivate = asyncHandler(async (req, res) => {
  const product = await productService.reactivateProduct(req.params.id as string);
  return ok(res, product, 'Product reactivated');
});

export const adjustStock = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const result = await productService.adjustStock(
    req.params.id as string,
    req.body as AdjustStockInput,
    user.id,
  );

  return created(
    res,
    result,
    `Stock ${result.movement.movementType === 'IN' ? 'increased' : 'reduced'} by ${result.movement.quantityChanged}. New balance: ${result.product.currentStock}.`,
  );
});
