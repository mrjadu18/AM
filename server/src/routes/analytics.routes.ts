import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as analyticsController from '../controllers/analytics.controller.js';

const router = Router();

router.get('/products', authenticate, analyticsController.getProductAnalytics);
router.get('/revenue-by-product', authenticate, analyticsController.getRevenueByProduct);
router.get('/category-performance', authenticate, analyticsController.getCategoryPerformance);

export default router;
