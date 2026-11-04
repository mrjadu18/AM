import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { PERMISSIONS } from '../config/permissions.js';
import * as approvalsController from '../controllers/approvals.controller.js';

const router = Router();

router.get(
  '/',
  authenticate,
  requirePermission(
    PERMISSIONS.RESOURCES_REVIEW,
    PERMISSIONS.TASKS_REVIEW,
    PERMISSIONS.TICKETS_APPROVE
  ),
  approvalsController.getApprovals
);

router.post(
  '/:id/decide',
  authenticate,
  requirePermission(
    PERMISSIONS.RESOURCES_APPROVE,
    PERMISSIONS.TASKS_APPROVE,
    PERMISSIONS.TICKETS_APPROVE
  ),
  approvalsController.decideApproval
);

export default router;
