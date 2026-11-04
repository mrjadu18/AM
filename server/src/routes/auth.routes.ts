import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { authLimiter } from '../middleware/rateLimit.middleware.js';
import { strictLimiter } from '../middleware/rateLimit.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { PERMISSIONS } from '../config/permissions.js';
import * as authController from '../controllers/auth.controller.js';

const router = Router();

router.post('/login', authLimiter, authController.login);
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.getMe);
router.patch('/profile', authenticate, authController.updateProfile);
router.patch('/change-password', authenticate, authController.changePassword);
router.post('/refresh-token', authController.refreshToken);
router.post('/password-recovery', strictLimiter, authController.requestPasswordRecovery);
router.post('/password-recovery/complete', strictLimiter, authController.completePasswordRecovery);
router.get('/password-recovery', authenticate, requirePermission(PERMISSIONS.USERS_RESET_PASSWORD), authController.listPasswordRecoveryRequests);
router.post('/password-recovery/:requestId/approve', authenticate, requirePermission(PERMISSIONS.USERS_RESET_PASSWORD), authController.approvePasswordRecovery);
router.post('/password-recovery/:requestId/reject', authenticate, requirePermission(PERMISSIONS.USERS_RESET_PASSWORD), authController.rejectPasswordRecovery);

export default router;
