import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as notificationsController from '../controllers/notifications.controller.js';

const router = Router();

router.get('/', authenticate, notificationsController.getNotifications);
router.post('/', authenticate, notificationsController.createNotification);
router.patch('/:id/read', authenticate, notificationsController.markAsRead);
router.patch('/read-all', authenticate, notificationsController.markAllAsRead);
router.delete('/:id', authenticate, notificationsController.deleteNotification);

export default router;
