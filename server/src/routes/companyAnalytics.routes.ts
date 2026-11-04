import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { PERMISSIONS } from '../config/permissions.js';
import * as companyAnalyticsController from '../controllers/companyAnalytics.controller.js';

const router = Router();

router.get(
  '/dashboard',
  authenticate,
  companyAnalyticsController.getCompanyDashboard
);

router.get(
  '/tasks',
  authenticate,
  requirePermission(PERMISSIONS.ANALYTICS_VIEW, PERMISSIONS.TASKS_VIEW),
  companyAnalyticsController.getTaskAnalytics
);

router.get(
  '/tickets',
  authenticate,
  requirePermission(PERMISSIONS.ANALYTICS_VIEW, PERMISSIONS.TICKETS_VIEW),
  companyAnalyticsController.getTicketAnalytics
);

export default router;
