import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as financeController from '../controllers/finance.controller.js';

const router = Router();

router.get('/summary', authenticate, financeController.getFinanceSummary);
router.get('/transactions', authenticate, financeController.getTransactions);
router.get('/transactions/:id', authenticate, financeController.getTransactionById);
router.patch('/transactions/:id/settle', authenticate, financeController.settleTransaction);

export default router;
