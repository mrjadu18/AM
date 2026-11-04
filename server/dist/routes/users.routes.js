import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { PERMISSIONS } from '../config/permissions.js';
import * as usersController from '../controllers/users.controller.js';
const router = Router();
router.get('/', authenticate, requirePermission(PERMISSIONS.USERS_VIEW, PERMISSIONS.TASKS_VIEW_TEAM), usersController.getUsers);
router.get('/:id', authenticate, requirePermission(PERMISSIONS.USERS_VIEW), usersController.getUserById);
router.post('/', authenticate, requirePermission(PERMISSIONS.USERS_CREATE), usersController.createUser);
router.patch('/:id', authenticate, requirePermission(PERMISSIONS.USERS_UPDATE), usersController.updateUser);
router.patch('/:id/status', authenticate, requirePermission(PERMISSIONS.USERS_DEACTIVATE), usersController.setUserStatus);
router.post('/:id/reset-password', authenticate, requirePermission(PERMISSIONS.USERS_RESET_PASSWORD), usersController.resetPassword);
router.post('/:id/revoke-sessions', authenticate, requirePermission(PERMISSIONS.USERS_REVOKE_SESSIONS), usersController.revokeSessions);
router.patch('/:id/permissions', authenticate, requirePermission(PERMISSIONS.PERMISSIONS_ASSIGN), usersController.updatePermissions);
// This is deliberately separate from account status changes.  The controller
// retains historical references while irrevocably removing access.
router.delete('/:id', authenticate, requirePermission(PERMISSIONS.USERS_DELETE), usersController.deleteUser);
export default router;
