import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { idParamSchema, paginationSchema } from '../../utils/query';
import {
  createCustomerSchema,
  createFollowUpSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from './customer.schema';
import * as controller from './customer.controller';

const router = Router();

/**
 * Access model for this module:
 *   read   - every authenticated role (warehouse and accounts need to look
 *            customers up, they just cannot change them)
 *   write  - ADMIN and SALES, the two roles that own the customer relationship
 *   delete - ADMIN only
 */
const canWrite = authorize('ADMIN', 'SALES');
const canDelete = authorize('ADMIN');

router.use(authenticate);

router.get('/', validate({ query: listCustomersQuerySchema }), controller.list);
router.get('/summary', controller.summary);

router.post('/', canWrite, validate({ body: createCustomerSchema }), controller.create);

router.get('/:id', validate({ params: idParamSchema }), controller.getOne);

router.patch(
  '/:id',
  canWrite,
  validate({ params: idParamSchema, body: updateCustomerSchema }),
  controller.update,
);

router.delete('/:id', canDelete, validate({ params: idParamSchema }), controller.deactivate);

router.post('/:id/reactivate', canDelete, validate({ params: idParamSchema }), controller.reactivate);

router.get(
  '/:id/followups',
  validate({ params: idParamSchema, query: paginationSchema }),
  controller.listFollowUps,
);

router.post(
  '/:id/followups',
  canWrite,
  validate({ params: idParamSchema, body: createFollowUpSchema }),
  controller.addFollowUp,
);

export default router;
