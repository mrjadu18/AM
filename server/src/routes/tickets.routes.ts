import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { PERMISSIONS } from '../config/permissions.js';
import * as ticketsController from '../controllers/tickets.controller.js';
import { upload } from '../middleware/upload.middleware.js';

const router = Router();

router.get(
  '/',
  authenticate,
  requirePermission(PERMISSIONS.TICKETS_VIEW, PERMISSIONS.RESOURCES_VIEW),
  ticketsController.getTickets
);

router.get(
  '/:id',
  authenticate,
  requirePermission(PERMISSIONS.TICKETS_VIEW, PERMISSIONS.RESOURCES_VIEW),
  ticketsController.getTicketById
);

router.post(
  '/',
  authenticate,
  requirePermission(PERMISSIONS.TICKETS_CREATE, PERMISSIONS.RESOURCES_REQUEST),
  ticketsController.createTicket
);

router.patch(
  '/:id',
  authenticate,
  requirePermission(PERMISSIONS.TICKETS_UPDATE),
  ticketsController.updateTicket
);

router.post(
  '/:id/comments',
  authenticate,
  requirePermission(PERMISSIONS.TICKETS_VIEW),
  ticketsController.addComment
);
router.post('/:id/attachments', authenticate, requirePermission(PERMISSIONS.TICKETS_VIEW), upload.array('files', 10), ticketsController.uploadTicketAttachments);
router.get('/:id/attachments/:fileId', authenticate, requirePermission(PERMISSIONS.TICKETS_VIEW), ticketsController.downloadTicketAttachment);

router.post(
  '/:id/resource-decision',
  authenticate,
  requirePermission(PERMISSIONS.RESOURCES_REVIEW, PERMISSIONS.RESOURCES_APPROVE),
  ticketsController.decideResourceRequest
);
router.post('/:id/decision', authenticate, requirePermission(PERMISSIONS.TICKETS_UPDATE, PERMISSIONS.RESOURCES_REVIEW), ticketsController.decideTicket);

router.post(
  '/:id/allocate',
  authenticate,
  requirePermission(PERMISSIONS.RESOURCES_ALLOCATE, PERMISSIONS.RESOURCES_MANAGE),
  ticketsController.allocateResource
);

router.delete(
  '/:id',
  authenticate,
  requirePermission(PERMISSIONS.TICKETS_CLOSE),
  ticketsController.deleteTicket
);

export default router;
