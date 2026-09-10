import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import customerRoutes from '../modules/customers/customer.routes';
import productRoutes from '../modules/products/product.routes';
import stockRoutes from '../modules/stock/stock.routes';

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
        products: {
          'GET /api/products': 'Paginated list with search, category and low-stock filters',
          'GET /api/products/summary': 'Counts for the dashboard',
          'GET /api/products/low-stock': 'Products at or below their alert level',
          'GET /api/products/categories': 'Distinct category list for filters',
          'POST /api/products': 'Create a product (ADMIN, WAREHOUSE)',
          'GET /api/products/:id': 'Product detail with its recent stock movements',
          'PATCH /api/products/:id': 'Update a product (ADMIN, WAREHOUSE)',
          'DELETE /api/products/:id': 'Deactivate a product (ADMIN)',
          'POST /api/products/:id/stock': 'Record an IN or OUT movement (ADMIN, WAREHOUSE)',
        },
        stock: {
          'GET /api/stock-movements': 'The stock ledger, filterable by product, type and date',
          'GET /api/stock-movements/summary': 'Movement counts',
        },
      },
    },
  });
});

router.use('/auth', authRoutes);
router.use('/customers', customerRoutes);
router.use('/products', productRoutes);
router.use('/stock-movements', stockRoutes);

export default router;
