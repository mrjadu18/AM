import { Request, Response } from 'express';
import { z } from 'zod';
import Ticket, { TicketType, TicketStatus } from '../models/Ticket.js';
import Task from '../models/Task.js';
import Admin from '../models/Admin.js';
import Approval from '../models/Approval.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, calculateTotalPages } from '../utils/pagination.js';
import { createAuditLog } from '../services/audit.service.js';
import { sendNotification } from '../services/notification.service.js';
import { getEffectivePermissions } from '../middleware/permission.middleware.js';
import { PERMISSIONS } from '../config/permissions.js';
import FileAsset from '../models/FileAsset.js';
import { persistUpload, resolveStoredFile, validateUpload } from '../services/storage.service.js';

const createTicketSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  ticketType: z.enum(['Requirement Request', 'Resource Request', 'Technical Support', 'Task Blocker']).default('Technical Support'),
  category: z.enum(['Technical', 'Finance', 'Seller', 'Customer', 'Requirement', 'Resource', 'Other']).default('Technical'),
  priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).default('Medium'),
  assigned: z.string().optional(),
  assignedId: z.string().optional(),
  description: z.string().optional(),
  reason: z.string().optional(),
  expectedOutcome: z.string().optional(),
  relatedTaskId: z.string().optional(),
  resourceDetails: z.object({
    resourceType: z.enum(['Software', 'Hardware', 'Cloud/Hosting', 'API Credits', 'Database', 'Access/License', 'Budget', 'Team Member', 'Training', 'Other']).default('Software'),
    resourceName: z.string().min(1, 'Resource name is required'),
    businessJustification: z.string().optional(),
    quantity: z.number().min(1).default(1),
    estimatedCost: z.number().min(0).default(0),
    currency: z.string().default('INR'),
    requiredBy: z.string().optional(),
  }).optional(),
});

const updateTicketSchema = z.object({
  title: z.string().min(1).optional(),
  ticketType: z.enum(['Requirement Request', 'Resource Request', 'Technical Support', 'Task Blocker']).optional(),
  category: z.enum(['Technical', 'Finance', 'Seller', 'Customer', 'Requirement', 'Resource', 'Other']).optional(),
  priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).optional(),
  assigned: z.string().optional(),
  assignedId: z.string().optional(),
  status: z.enum(['Open', 'In Progress', 'Under Review', 'Additional Info Required', 'Approved', 'Rejected', 'Resolved', 'Closed']).optional(),
  description: z.string().optional(),
  reason: z.string().optional(),
  expectedOutcome: z.string().optional(),
  resolutionNotes: z.string().optional(),
});

const addCommentSchema = z.object({
  text: z.string().min(1, 'Comment text is required'),
  isInternal: z.boolean().default(false),
});
const decisionSchema = z.object({ decision: z.enum(['approve', 'reject', 'request_changes']), response: z.string().min(1, 'A response is required'), instructions: z.string().optional() });

export const getTickets = asyncHandler(async (req: Request, res: Response) => {
  const {
    page = 1,
    limit = 10,
    search = '',
    ticketType = '',
    status = '',
    priority = '',
    category = '',
    scope = 'all', // 'all' | 'my'
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = req.query;

  const currentUserId = req.admin?._id;
  const { isSuperAdmin, permissions } = await getEffectivePermissions(currentUserId!);

  const pagination = getPagination({
    page: Number(page),
    limit: Number(limit),
    sortBy: String(sortBy),
    sortOrder: sortOrder as 'asc' | 'desc',
  });

  const query: any = {};

  if (scope === 'my' || (!isSuperAdmin && !permissions.has(PERMISSIONS.TICKETS_ASSIGN) && !permissions.has(PERMISSIONS.RESOURCES_REVIEW))) {
    query.$or = [{ requesterId: currentUserId }, { assignedId: currentUserId }, { createdBy: req.admin?.email }];
  }

  if (search) {
    query.$or = [
      { id: { $regex: search, $options: 'i' } },
      { title: { $regex: search, $options: 'i' } },
      { assigned: { $regex: search, $options: 'i' } },
      { requesterName: { $regex: search, $options: 'i' } },
      { 'resourceDetails.resourceName': { $regex: search, $options: 'i' } },
    ];
  }

  if (ticketType) query.ticketType = ticketType;
  if (status) query.status = status;
  if (priority) query.priority = priority;
  if (category) query.category = category;

  const sortOptions: any = {};
  if (pagination.sortBy) {
    sortOptions[pagination.sortBy] = pagination.sortOrder === 'asc' ? 1 : -1;
  }

  const [tickets, total] = await Promise.all([
    Ticket.find(query)
      .populate('requesterId', 'fullName email department employeeId employeeSerial')
      .populate('assignedId', 'fullName email')
      .populate('relatedTaskId', 'taskId title status')
      .sort(sortOptions)
      .skip(pagination.skip)
      .limit(pagination.limit),
    Ticket.countDocuments(query),
  ]);

  pagination.total = total;
  pagination.totalPages = calculateTotalPages(total, pagination.limit);

  res.status(200).json(ApiResponse.success('Tickets retrieved successfully', tickets, pagination));
});

export const getTicketById = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await Ticket.findOne({ id: req.params.id })
    .populate('requesterId', 'fullName email department employeeId employeeSerial')
    .populate('assignedId', 'fullName email')
    .populate('relatedTaskId', 'taskId title status priority');

  if (!ticket) {
    throw new ApiError(404, 'Ticket not found');
  }

  const { isSuperAdmin, permissions } = await getEffectivePermissions(req.admin?._id!);
  const isParticipant = ticket.requesterId?.toString() === req.admin?._id || ticket.assignedId?.toString() === req.admin?._id;
  if (!isSuperAdmin && !permissions.has(PERMISSIONS.TICKETS_ASSIGN) && !permissions.has(PERMISSIONS.RESOURCES_REVIEW) && !isParticipant) {
    throw new ApiError(403, 'You are not authorized to view this ticket');
  }
  if (ticket.comments?.length && !isSuperAdmin && !permissions.has(PERMISSIONS.TICKETS_ASSIGN)) {
    ticket.comments = ticket.comments.filter((comment) => !comment.isInternal);
  }

  const attachments = await FileAsset.find({ ownerType: 'ticket', ownerId: ticket.id });
  (ticket as any).attachments = attachments;

  res.status(200).json(ApiResponse.success('Ticket retrieved successfully', ticket));
});

export const createTicket = asyncHandler(async (req: Request, res: Response) => {
  const data = createTicketSchema.parse(req.body);

  const prefix = data.ticketType === 'Resource Request' ? 'REQ' :
    data.ticketType === 'Requirement Request' ? 'RQT' :
      data.ticketType === 'Task Blocker' ? 'BLK' : 'TKT';

  const count = await Ticket.countDocuments();
  const id = `${prefix}-${String(count + 1).padStart(3, '0')}`;

  let relatedTaskDoc = null;
  if (data.relatedTaskId) {
    relatedTaskDoc = await Task.findOne({
      $or: [
        { taskId: data.relatedTaskId },
        { _id: data.relatedTaskId.match(/^[0-9a-fA-F]{24}$/) ? data.relatedTaskId : null }
      ]
    });
  }

  // Resolve assigned user if assignedId is provided
  let assignedName = data.assigned || 'Unassigned';
  if (data.assignedId) {
    const assignedUser = await Admin.findById(data.assignedId);
    if (assignedUser) {
      assignedName = assignedUser.fullName;
    }
  }

  // If this is a Resource Request, initialize status as 'Under Review' or 'Open'
  const initialStatus = data.ticketType === 'Resource Request' ? 'Under Review' : 'Open';

  const ticket = await Ticket.create({
    id,
    title: data.title,
    ticketType: data.ticketType,
    category: data.category,
    priority: data.priority,
    status: initialStatus,
    description: data.description,
    reason: data.reason,
    expectedOutcome: data.expectedOutcome,
    assigned: assignedName,
    assignedId: data.assignedId as any,
    requesterId: req.admin?._id,
    requesterName: req.admin?.fullName,
    relatedTaskId: relatedTaskDoc?._id,
    relatedTaskCode: relatedTaskDoc?.taskId,
    resourceDetails: data.resourceDetails ? {
      ...data.resourceDetails,
      requiredBy: data.resourceDetails.requiredBy ? new Date(data.resourceDetails.requiredBy) : undefined,
      allocationStatus: 'Unallocated',
    } : undefined,
    createdBy: req.admin?.email,
  });

  // If it's a Resource Request, automatically register an Approval entry
  if (data.ticketType === 'Resource Request') {
    const appCount = await Approval.countDocuments();
    await Approval.create({
      approvalId: `APP-${String(appCount + 1).padStart(3, '0')}`,
      approvalType: 'Resource Request',
      title: `Resource: ${data.resourceDetails?.resourceName || ticket.title}`,
      description: data.resourceDetails?.businessJustification || ticket.description,
      referenceModel: 'Ticket',
      referenceId: ticket._id,
      referenceCode: ticket.id,
      requesterId: req.admin?._id,
      requesterName: req.admin?.fullName || 'Requester',
      status: 'Pending',
      metadata: {
        cost: data.resourceDetails?.estimatedCost,
        resourceType: data.resourceDetails?.resourceType,
      },
    });
  }

  // If linked to a task and ticket is a Blocker, set task to Blocked
  if (data.ticketType === 'Task Blocker' && relatedTaskDoc) {
    relatedTaskDoc.status = 'Blocked';
    if (!relatedTaskDoc.relatedTickets.includes(ticket.id)) {
      relatedTaskDoc.relatedTickets.push(ticket.id);
    }
    await relatedTaskDoc.save();
  }

  await createAuditLog({
    action: 'TICKET_CREATED',
    entity: 'Ticket',
    entityId: ticket.id,
    adminId: req.admin?._id,
    adminName: req.admin?.fullName,
    details: { ticketType: ticket.ticketType, title: ticket.title, priority: ticket.priority },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(201).json(ApiResponse.success('Ticket created successfully', ticket));
});

export const updateTicket = asyncHandler(async (req: Request, res: Response) => {
  const updates = updateTicketSchema.parse(req.body);

  const ticket = await Ticket.findOne({ id: req.params.id });
  if (!ticket) {
    throw new ApiError(404, 'Ticket not found');
  }

  if (updates.assignedId) {
    const assignedUser = await Admin.findById(updates.assignedId);
    if (assignedUser) {
      ticket.assigned = assignedUser.fullName;
      ticket.assignedId = assignedUser._id as any;

      await sendNotification({
        adminId: assignedUser._id,
        title: 'Ticket Assigned to You',
        message: `You have been assigned to ticket: ${ticket.title} (${ticket.id})`,
        link: `/tickets/${ticket.id}`,
      });
    }
  }

  if (updates.status === 'Resolved' && ticket.status !== 'Resolved') {
    ticket.resolvedAt = new Date();
    ticket.resolvedBy = req.admin?._id as any;
  }

  Object.assign(ticket, updates);
  await ticket.save();

  await createAuditLog({
    action: 'TICKET_UPDATED',
    entity: 'Ticket',
    entityId: ticket.id,
    adminId: req.admin?._id,
    adminName: req.admin?.fullName,
    details: updates,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json(ApiResponse.success('Ticket updated successfully', ticket));
});

export const addComment = asyncHandler(async (req: Request, res: Response) => {
  const { text, isInternal = false } = addCommentSchema.parse(req.body);

  const ticket = await Ticket.findOne({ id: req.params.id });
  if (!ticket) {
    throw new ApiError(404, 'Ticket not found');
  }

  const comment = {
    id: new Date().getTime().toString(),
    text,
    author: req.admin?.fullName || 'Admin',
    authorId: req.admin?._id as any,
    isInternal,
    createdAt: new Date(),
  };

  ticket.comments.push(comment);
  await ticket.save();

  // Notify requester if commented by someone else
  if (ticket.requesterId && ticket.requesterId.toString() !== req.admin?._id) {
    await sendNotification({
      adminId: ticket.requesterId,
      title: `New Comment on Ticket ${ticket.id}`,
      message: `${req.admin?.fullName} replied on: ${ticket.title}`,
      link: `/tickets/${ticket.id}`,
    });
  }

  res.status(200).json(ApiResponse.success('Comment added successfully', ticket));
});

export const decideTicket = asyncHandler(async (req: Request, res: Response) => {
  const { decision, response, instructions } = decisionSchema.parse(req.body);
  const ticket = await Ticket.findOne({ id: req.params.id });
  if (!ticket) throw new ApiError(404, 'Ticket not found');
  const status = decision === 'approve' ? 'Approved' : decision === 'reject' ? 'Rejected' : 'Additional Info Required';
  ticket.status = status;
  ticket.resolutionNotes = [response, instructions].filter(Boolean).join('\n\n');
  ticket.comments.push({ id: new Date().getTime().toString(), text: `[${decision}] ${ticket.resolutionNotes}`, author: req.admin?.fullName || 'Admin', authorId: req.admin?._id as any, isInternal: false, createdAt: new Date() });
  await ticket.save();
  if (ticket.requesterId) await sendNotification({ adminId: ticket.requesterId, title: `Ticket ${status}`, message: response, type: decision === 'approve' ? 'success' : decision === 'reject' ? 'error' : 'warning', link: `/tickets/${ticket.id}` });
  res.json(ApiResponse.success(`Ticket ${status.toLowerCase()}`, ticket));
});

export const decideResourceRequest = asyncHandler(async (req: Request, res: Response) => {
  const { decision, notes = '' } = req.body; // 'approve' | 'reject' | 'request_info'

  const ticket = await Ticket.findOne({ id: req.params.id });
  if (!ticket || ticket.ticketType !== 'Resource Request') {
    throw new ApiError(404, 'Resource request ticket not found');
  }

  // Prevent self-approval (separation of duties)
  if (ticket.requesterId && ticket.requesterId.toString() === req.admin?._id && req.admin?.role !== 'Super Admin') {
    throw new ApiError(403, 'Separation of duties: You cannot approve your own resource request');
  }

  if (decision === 'approve') {
    ticket.status = 'Approved';
  } else if (decision === 'reject') {
    ticket.status = 'Rejected';
  } else {
    ticket.status = 'Additional Info Required';
  }

  if (ticket.resourceDetails) {
    ticket.resourceDetails.decisionNotes = notes;
    ticket.resourceDetails.decisionBy = req.admin?._id as any;
    ticket.resourceDetails.decisionByName = req.admin?.fullName;
    ticket.resourceDetails.decisionDate = new Date();
  }

  await ticket.save();

  // Sync approval record
  await Approval.findOneAndUpdate(
    { referenceId: ticket._id, referenceModel: 'Ticket' },
    {
      $set: {
        status: decision === 'approve' ? 'Approved' : decision === 'reject' ? 'Rejected' : 'Needs Information',
        decisionBy: req.admin?._id,
        decisionByName: req.admin?.fullName,
        decisionNotes: notes,
        decidedAt: new Date(),
      },
    }
  );

  // Notify requester
  if (ticket.requesterId) {
    await sendNotification({
      adminId: ticket.requesterId,
      title: `Resource Request ${ticket.status}`,
      message: `Your request for ${ticket.resourceDetails?.resourceName || ticket.title} has been marked as ${ticket.status}. Notes: ${notes}`,
      type: decision === 'approve' ? 'success' : decision === 'reject' ? 'error' : 'warning',
      link: `/employee/my-requests`,
    });
  }

  await createAuditLog({
    action: `RESOURCE_REQUEST_${decision.toUpperCase()}`,
    entity: 'Ticket',
    entityId: ticket.id,
    adminId: req.admin?._id,
    adminName: req.admin?.fullName,
    details: { decision, notes },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json(ApiResponse.success(`Resource request decision recorded: ${ticket.status}`, ticket));
});

export const allocateResource = asyncHandler(async (req: Request, res: Response) => {
  const { allocationStatus, allocatedDetails = '' } = req.body; // 'Allocated' | 'Fulfilled' | 'Cancelled'

  const ticket = await Ticket.findOne({ id: req.params.id });
  if (!ticket || ticket.ticketType !== 'Resource Request') {
    throw new ApiError(404, 'Resource request ticket not found');
  }

  if (!ticket.resourceDetails) {
    throw new ApiError(400, 'Ticket has no resource details');
  }

  ticket.resourceDetails.allocationStatus = allocationStatus;
  ticket.resourceDetails.allocatedDetails = allocatedDetails;

  if (allocationStatus === 'Fulfilled') {
    ticket.resourceDetails.fulfilledAt = new Date();
    ticket.status = 'Resolved';
  }

  await ticket.save();

  // Notify requester if resource is fulfilled
  if (ticket.requesterId) {
    await sendNotification({
      adminId: ticket.requesterId,
      title: `Resource Requisition ${allocationStatus}`,
      message: `Your resource request "${ticket.resourceDetails?.resourceName || ticket.title}" status has been updated to ${allocationStatus}. Details: ${allocatedDetails || 'None'}`,
      type: allocationStatus === 'Fulfilled' ? 'success' : 'info',
      link: `/employee/my-requests`,
    });
  }

  await createAuditLog({
    action: `RESOURCE_ALLOCATION_${allocationStatus.toUpperCase()}`,
    entity: 'Ticket',
    entityId: ticket.id,
    adminId: req.admin?._id,
    adminName: req.admin?.fullName,
    details: { allocationStatus, allocatedDetails },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json(ApiResponse.success(`Resource allocation status updated to ${allocationStatus}`, ticket));
});

export const deleteTicket = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await Ticket.findOneAndDelete({ id: req.params.id });

  if (!ticket) {
    throw new ApiError(404, 'Ticket not found');
  }

  await createAuditLog({
    action: 'TICKET_DELETED',
    entity: 'Ticket',
    entityId: ticket.id,
    adminId: req.admin?._id,
    adminName: req.admin?.fullName,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json(ApiResponse.success('Ticket deleted successfully', ticket));
});

async function assertTicketParticipant(ticket: any, adminId?: string, role?: string) {
  if (role === 'Super Admin' || ticket.requesterId?.toString() === adminId || ticket.assignedId?.toString() === adminId) return;
  const access = await getEffectivePermissions(adminId!);
  if (!access.permissions.has(PERMISSIONS.TICKETS_ASSIGN) && !access.permissions.has(PERMISSIONS.RESOURCES_REVIEW)) throw new ApiError(403, 'You are not authorized to access ticket documents');
}
export const uploadTicketAttachments = asyncHandler(async (req: Request, res: Response) => { const ticket = await Ticket.findOne({ id: req.params.id }); if (!ticket) throw new ApiError(404, 'Ticket not found'); await assertTicketParticipant(ticket, req.admin?._id, req.admin?.role); const assets = []; for (const file of ((req.files as Express.Multer.File[]) || [])) { validateUpload(file); const stored = persistUpload(file); assets.push(await FileAsset.create({ fileId: `FIL-${Date.now()}-${assets.length}`, originalName: file.originalname, storedName: stored.storedName, mimeType: file.mimetype, size: file.size, ownerType: 'ticket', ownerId: ticket.id, kind: req.admin?.role === 'Super Admin' ? 'admin' : 'employee', uploadedBy: req.admin?._id, uploadedByName: req.admin?.fullName })); } res.status(201).json(ApiResponse.success('Ticket documents uploaded', assets)); });
export const downloadTicketAttachment = asyncHandler(async (req: Request, res: Response) => { const ticket = await Ticket.findOne({ id: req.params.id }); const asset = await FileAsset.findOne({ fileId: req.params.fileId, ownerType: 'ticket', ownerId: req.params.id }); if (!ticket || !asset) throw new ApiError(404, 'Ticket document not found'); await assertTicketParticipant(ticket, req.admin?._id, req.admin?.role); res.setHeader('Content-Type', asset.mimeType); res.sendFile(resolveStoredFile(asset.storedName)); });
