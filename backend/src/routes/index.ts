import { Router } from 'express';

/**
 * Central API router. Feature routers are mounted here as each module is built:
 *   authRoutes      -> /auth        (S2)
 *   customerRoutes  -> /customers   (S3)
 *   productRoutes   -> /products    (S4)
 *   stockRoutes     -> /stock-movements (S4)
 *   challanRoutes   -> /challans    (S5)
 */
const router = Router();

router.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      name: 'Mini ERP + CRM Operations Portal API',
      version: '1.0.0',
      documentation: '/api/health',
    },
  });
});

export default router;
