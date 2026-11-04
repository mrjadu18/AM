import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as auditController from '../controllers/audit.controller.js';
const router = Router();
router.get('/', authenticate, auditController.getAuditLogs);
router.get('/:id', authenticate, auditController.getAuditLogById);
export default router;
