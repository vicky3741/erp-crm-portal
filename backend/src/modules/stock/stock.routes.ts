import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { listStockMovementsQuerySchema } from './stock.schema';
import * as controller from './stock.controller';

const router = Router();

/**
 * The stock ledger is read-only over HTTP by design. Rows are only ever
 * written by `applyStockMovement`, as part of the transaction that changed the
 * stock — there is no endpoint that can add a movement without the stock
 * change, or change the stock without a movement.
 *
 * Every authenticated role can read it: sales need to see why stock moved,
 * accounts need it to reconcile.
 */
router.use(authenticate);

router.get('/summary', controller.summary);
router.get('/', validate({ query: listStockMovementsQuerySchema }), controller.list);

export default router;
