import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';

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
      },
    },
  });
});

router.use('/auth', authRoutes);

export default router;
