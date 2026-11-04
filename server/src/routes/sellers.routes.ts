import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as sellersController from '../controllers/sellers.controller.js';

const router = Router();

router.get('/', authenticate, sellersController.getSellers);
router.get('/:id', authenticate, sellersController.getSellerById);
router.post('/', authenticate, sellersController.createSeller);
router.patch('/:id', authenticate, sellersController.updateSeller);
router.patch('/:id/status', authenticate, sellersController.updateSellerStatus);
router.delete('/:id', authenticate, sellersController.deleteSeller);

export default router;
