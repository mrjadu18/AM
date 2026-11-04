import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as ordersController from '../controllers/orders.controller.js';
const router = Router();
router.get('/', authenticate, ordersController.getOrders);
router.get('/:id', authenticate, ordersController.getOrderById);
router.patch('/:id/status', authenticate, ordersController.updateOrderStatus);
export default router;
