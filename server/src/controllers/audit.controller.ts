import { Request, Response } from 'express';
import AuditLog from '../models/AuditLog.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, calculateTotalPages } from '../utils/pagination.js';

export const getAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 10, search = '', entity = '', action = '', adminId = '' } = req.query;

  const pagination = getPagination({
    page: Number(page),
    limit: Number(limit),
  });

  const query: any = {};

  if (search) {
    query.$or = [
      { id: { $regex: search, $options: 'i' } },
      { action: { $regex: search, $options: 'i' } },
      { entity: { $regex: search, $options: 'i' } },
      { adminName: { $regex: search, $options: 'i' } },
    ];
  }

  if (entity) {
    query.entity = entity;
  }

  if (action) {
    query.action = action;
  }

  if (adminId) {
    query.adminId = adminId;
  }

  const [logs, total] = await Promise.all([
    AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit),
    AuditLog.countDocuments(query),
  ]);

  pagination.total = total;
  pagination.totalPages = calculateTotalPages(total, pagination.limit);

  res.status(200).json(
    ApiResponse.success('Audit logs retrieved successfully', logs, pagination)
  );
});

export const getAuditLogById = asyncHandler(async (req: Request, res: Response) => {
  const log = await AuditLog.findOne({ id: req.params.id });

  if (!log) {
    throw new ApiError(404, 'Audit log not found');
  }

  res.status(200).json(
    ApiResponse.success('Audit log retrieved successfully', log)
  );
});
