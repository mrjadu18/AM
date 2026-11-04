import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { PERMISSIONS } from '../config/permissions.js';
import * as employeeController from '../controllers/employee.controller.js';
const router = Router();
// All routes require authentication
router.use(authenticate);
// Employee Dashboard
router.get('/dashboard', requirePermission(PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.TASKS_VIEW), employeeController.getEmployeeDashboard);
// My Assigned Tasks
router.get('/tasks', requirePermission(PERMISSIONS.TASKS_VIEW), employeeController.getMyTasks);
router.get('/tasks/:id', requirePermission(PERMISSIONS.TASKS_VIEW), employeeController.getMyTaskById);
router.post('/tasks/:id/progress', requirePermission(PERMISSIONS.TASKS_UPDATE_PROGRESS), employeeController.submitTaskProgress);
// My Resource & Requirement Requests
router.get('/requests', requirePermission(PERMISSIONS.RESOURCES_VIEW, PERMISSIONS.RESOURCES_REQUEST), employeeController.getMyRequests);
router.post('/requests', requirePermission(PERMISSIONS.RESOURCES_REQUEST), employeeController.createRequest);
// My Tickets
router.get('/tickets', requirePermission(PERMISSIONS.TICKETS_VIEW), employeeController.getMyTickets);
router.post('/tickets', requirePermission(PERMISSIONS.TICKETS_CREATE), employeeController.createTicket);
router.get('/tickets/:id', requirePermission(PERMISSIONS.TICKETS_VIEW), employeeController.getMyTicketById);
router.post('/tickets/:id/comments', requirePermission(PERMISSIONS.TICKETS_VIEW), employeeController.addTicketComment);
// My Profile
router.get('/profile', requirePermission(PERMISSIONS.PROFILE_VIEW), employeeController.getMyProfile);
router.patch('/profile', requirePermission(PERMISSIONS.PROFILE_UPDATE), employeeController.updateMyProfile);
export default router;
