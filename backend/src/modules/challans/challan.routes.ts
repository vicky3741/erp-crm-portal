import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { idParamSchema } from '../../utils/query';
import {
  cancelChallanSchema,
  createChallanSchema,
  listChallansQuerySchema,
  updateChallanSchema,
} from './challan.schema';
import * as controller from './challan.controller';

const router = Router();

/**
 * Access model for this module:
 *   read    - every authenticated role
 *   raise   - ADMIN and SALES, who own the customer order
 *   confirm - ADMIN, SALES and WAREHOUSE; the warehouse physically dispatches
 *             the goods, so it must be able to commit the stock movement
 *   cancel  - ADMIN only, because cancelling reverses stock
 */
const canRaise = authorize('ADMIN', 'SALES');
const canConfirm = authorize('ADMIN', 'SALES', 'WAREHOUSE');
const canCancel = authorize('ADMIN');

router.use(authenticate);

router.get('/summary', controller.summary);

router.get('/', validate({ query: listChallansQuerySchema }), controller.list);
router.post('/', canRaise, validate({ body: createChallanSchema }), controller.create);

router.get('/:id', validate({ params: idParamSchema }), controller.getOne);

router.patch(
  '/:id',
  canRaise,
  validate({ params: idParamSchema, body: updateChallanSchema }),
  controller.update,
);

router.post('/:id/confirm', canConfirm, validate({ params: idParamSchema }), controller.confirm);

router.post(
  '/:id/cancel',
  canCancel,
  validate({ params: idParamSchema, body: cancelChallanSchema }),
  controller.cancel,
);

export default router;
