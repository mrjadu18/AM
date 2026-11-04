import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { PERMISSIONS } from '../config/permissions.js';
import * as tasksController from '../controllers/tasks.controller.js';
import * as taskUpdatesController from '../controllers/taskUpdates.controller.js';
import { upload } from '../middleware/upload.middleware.js';

const router = Router();

// TASK ROUTES
router.get(
  '/',
  authenticate,
  requirePermission(PERMISSIONS.TASKS_VIEW),
  tasksController.getTasks
);

router.get(
  '/:id',
  authenticate,
  requirePermission(PERMISSIONS.TASKS_VIEW),
  tasksController.getTaskById
);

router.post(
  '/',
  authenticate,
  requirePermission(PERMISSIONS.TASKS_CREATE),
  tasksController.createTask
);

router.patch(
  '/:id',
  authenticate,
  requirePermission(PERMISSIONS.TASKS_UPDATE),
  tasksController.updateTask
);

router.post(
  '/:id/acknowledge',
  authenticate,
  requirePermission(PERMISSIONS.TASKS_VIEW),
  tasksController.acknowledgeTask
);
router.post('/:id/attachments', authenticate, requirePermission(PERMISSIONS.TASKS_VIEW), upload.array('files', 10), tasksController.uploadTaskAttachments);
router.get('/:id/attachments/:fileId', authenticate, requirePermission(PERMISSIONS.TASKS_VIEW), tasksController.downloadTaskAttachment);

router.post(
  '/:id/submit-for-review',
  authenticate,
  requirePermission(PERMISSIONS.TASKS_SUBMIT_FOR_REVIEW),
  tasksController.submitTaskForReview
);

router.post(
  '/:id/review',
  authenticate,
  requirePermission(PERMISSIONS.TASKS_REVIEW, PERMISSIONS.TASKS_APPROVE),
  tasksController.reviewTask
);

router.delete(
  '/:id',
  authenticate,
  requirePermission(PERMISSIONS.TASKS_DELETE),
  tasksController.deleteTask
);

// TASK UPDATES & PROGRESS
router.post(
  '/updates/submit',
  authenticate,
  requirePermission(PERMISSIONS.TASKS_UPDATE_PROGRESS),
  taskUpdatesController.submitProgressUpdate
);

router.get(
  '/:taskId/updates',
  authenticate,
  requirePermission(PERMISSIONS.TASKS_VIEW),
  taskUpdatesController.getTaskUpdates
);

router.post(
  '/:taskId/request-update',
  authenticate,
  requirePermission(PERMISSIONS.TASKS_REVIEW, PERMISSIONS.TASKS_UPDATE),
  taskUpdatesController.requestTaskUpdate
);

router.post(
  '/updates/:updateId/acknowledge',
  authenticate,
  requirePermission(PERMISSIONS.TASKS_REVIEW),
  taskUpdatesController.acknowledgeUpdate
);

export default router;
