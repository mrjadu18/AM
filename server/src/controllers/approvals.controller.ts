import { Request, Response } from 'express';
import Approval from '../models/Approval.js';
import Task from '../models/Task.js';
import Ticket from '../models/Ticket.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, calculateTotalPages } from '../utils/pagination.js';
import { createAuditLog } from '../services/audit.service.js';
import { sendNotification } from '../services/notification.service.js';

export const getApprovals = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 10, status = '', approvalType = '' } = req.query;

  const pagination = getPagination({
    page: Number(page),
    limit: Number(limit),
  });

  const query: any = {};
  if (status) query.status = status;
  if (approvalType) query.approvalType = approvalType;

  const [approvals, total] = await Promise.all([
    Approval.find(query)
      .populate('requesterId', 'fullName email department jobTitle')
      .populate('decisionBy', 'fullName email')
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit),
    Approval.countDocuments(query),
  ]);

  pagination.total = total;
  pagination.totalPages = calculateTotalPages(total, pagination.limit);

  res.status(200).json(ApiResponse.success('Approvals retrieved successfully', approvals, pagination));
});

export const decideApproval = asyncHandler(async (req: Request, res: Response) => {
  const { decision, notes = '' } = req.body; // 'Approved' | 'Rejected' | 'Needs Information'
  const idParam = String(req.params.id);
  const isMongoId = /^[0-9a-fA-F]{24}$/.test(idParam);

  const approval = await Approval.findOne({
    $or: [
      { approvalId: idParam },
      ...(isMongoId ? [{ _id: idParam }] : []),
    ],
  });

  if (!approval) {
    throw new ApiError(404, 'Approval request not found');
  }

  // Separation of duties: requester cannot approve own request (unless Super Admin)
  if (approval.requesterId.toString() === req.admin?._id && req.admin?.role !== 'Super Admin') {
    throw new ApiError(403, 'Separation of duties: You cannot approve your own request');
  }

  approval.status = decision;
  approval.decisionBy = req.admin?._id as any;
  approval.decisionByName = req.admin?.fullName;
  approval.decisionNotes = notes;
  approval.decidedAt = new Date();
  await approval.save();

  // Cascade to underlying entity
  if (approval.referenceModel === 'Task') {
    const task = await Task.findById(approval.referenceId);
    if (task) {
      if (decision === 'Approved') {
        task.status = 'Completed';
        task.approvedAt = new Date();
        task.completedAt = new Date();
        task.reviewFeedback = notes || 'Approved';
      } else if (decision === 'Needs Information') {
        task.status = 'Revision Requested';
        task.reviewFeedback = notes;
      }
      await task.save();
    }
  } else if (approval.referenceModel === 'Ticket') {
    const ticket = await Ticket.findById(approval.referenceId);
    if (ticket) {
      if (decision === 'Approved') {
        ticket.status = 'Approved';
      } else if (decision === 'Rejected') {
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
    }
  }

  await sendNotification({
    adminId: approval.requesterId,
    title: `Approval Decision: ${approval.status}`,
    message: `Your request "${approval.title}" has been ${approval.status} by ${req.admin?.fullName}. Notes: ${notes}`,
    type: decision === 'Approved' ? 'success' : decision === 'Rejected' ? 'error' : 'warning',
  });

  await createAuditLog({
    action: `APPROVAL_DECISION_${decision.toUpperCase().replace(/\s+/g, '_')}`,
    entity: 'Approval',
    entityId: approval.approvalId,
    adminId: req.admin?._id,
    adminName: req.admin?.fullName,
    details: { decision, notes, referenceModel: approval.referenceModel, referenceCode: approval.referenceCode },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json(ApiResponse.success('Approval decision recorded', approval));
});
