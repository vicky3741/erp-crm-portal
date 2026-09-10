import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { idParamSchema } from '../../utils/query';
import { adjustStockSchema } from '../stock/stock.schema';
import { createProductSchema, listProductsQuerySchema, updateProductSchema } from './product.schema';
import * as controller from './product.controller';

const router = Router();

/**
 * Access model for this module:
 *   read   - every authenticated role (sales must see prices and availability)
 *   write  - ADMIN and WAREHOUSE, the roles that own the physical inventory
 *   delete - ADMIN only
 */
const canWrite = authorize('ADMIN', 'WAREHOUSE');
const canDelete = authorize('ADMIN');

router.use(authenticate);

// Static paths are declared before "/:id" so they are not swallowed by it.
router.get('/summary', controller.summary);
router.get('/low-stock', controller.lowStock);
router.get('/categories', controller.categories);

router.get('/', validate({ query: listProductsQuerySchema }), controller.list);
router.post('/', canWrite, validate({ body: createProductSchema }), controller.create);

router.get('/:id', validate({ params: idParamSchema }), controller.getOne);

router.patch(
  '/:id',
  canWrite,
  validate({ params: idParamSchema, body: updateProductSchema }),
  controller.update,
);

router.delete('/:id', canDelete, validate({ params: idParamSchema }), controller.deactivate);
router.post('/:id/reactivate', canDelete, validate({ params: idParamSchema }), controller.reactivate);

// Manual stock correction: goods received, damage, stock-count adjustment.
router.post(
  '/:id/stock',
  canWrite,
  validate({ params: idParamSchema, body: adjustStockSchema }),
  controller.adjustStock,
);

export default router;
