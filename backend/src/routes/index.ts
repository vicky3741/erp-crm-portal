import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import customerRoutes from '../modules/customers/customer.routes';

/**
 * Central API router. Feature routers are mounted here as each module is built:
 *   authRoutes      -> /auth              (done)
 *   customerRoutes  -> /customers         (S3)
 *   productRoutes   -> /products          (S4)
 *   stockRoutes     -> /stock-movements   (S4)
 *   challanRoutes   -> /challans          (S5)
 */
const router = Router();

router.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      name: 'Mini ERP + CRM Operations Portal API',
      version: '1.0.0',
      health: '/api/health',
      endpoints: {
        auth: {
          'POST /api/auth/login': 'Exchange email and password for a JWT',
          'GET /api/auth/me': 'Profile of the authenticated user',
          'POST /api/auth/logout': 'Client-side token disposal',
          'GET /api/auth/admin-check': 'ADMIN-only route demonstrating RBAC',
        },
        customers: {
          'GET /api/customers': 'Paginated list with search, filters and sorting',
          'GET /api/customers/summary': 'Counts for the dashboard',
          'POST /api/customers': 'Create a customer (ADMIN, SALES)',
          'GET /api/customers/:id': 'Customer detail with follow-ups and recent challans',
          'PATCH /api/customers/:id': 'Update a customer (ADMIN, SALES)',
          'DELETE /api/customers/:id': 'Deactivate a customer (ADMIN)',
          'POST /api/customers/:id/reactivate': 'Reactivate a customer (ADMIN)',
          'GET /api/customers/:id/followups': 'Paginated follow-up notes',
          'POST /api/customers/:id/followups': 'Add a follow-up note (ADMIN, SALES)',
        },
      },
    },
  });
});

router.use('/auth', authRoutes);
router.use('/customers', customerRoutes);

export default router;
