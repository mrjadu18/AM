import { Request, Response } from 'express';
import { z } from 'zod';
import Task from '../models/Task.js';
import TaskUpdate from '../models/TaskUpdate.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, calculateTotalPages } from '../utils/pagination.js';
import { createAuditLog } from '../services/audit.service.js';
import { sendNotification } from '../services/notification.service.js';

const submitUpdateSchema = z.object({
  taskId: z.string().min(1, 'Task ID is required'),
  updateType: z.enum(['Daily', 'Milestone', 'Weekly', 'On-Demand', 'Blocker', 'Submission']).default('On-Demand'),
  progressPercentage: z.number().min(0).max(100),
  workCompleted: z.string().min(1, 'Summary of work completed is required'),
  workRemaining: z.string().optional(),
  currentBlockers: z.string().optional(),
  nextSteps: z.string().optional(),
  attachments: z.array(z.object({ name: z.string(), url: z.string() })).default([]),
});

export const submitProgressUpdate = asyncHandler(async (req: Request, res: Response) => {
  const data = submitUpdateSchema.parse(req.body);
  const taskIdParam = String(data.taskId);
  const isMongoId = /^[0-9a-fA-F]{24}$/.test(taskIdParam);

  const task = await Task.findOne({
    $or: [
      { taskId: taskIdParam },
      ...(isMongoId ? [{ _id: taskIdParam }] : []),
    ],
  });

  if (!task) {
    throw new ApiError(404, 'Task not found');
  }

  const count = await TaskUpdate.countDocuments();
  const updateId = `UPD-${String(count + 1).padStart(3, '0')}`;

  const update = await TaskUpdate.create({
    updateId,
    taskId: task._id,
    taskCode: task.taskId,
    employeeId: req.admin?._id,
    employeeName: req.admin?.fullName || 'Employee',
    updateType: data.updateType,
    progressPercentage: data.progressPercentage,
    workCompleted: data.workCompleted,
    workRemaining: data.workRemaining,
    currentBlockers: data.currentBlockers,
    nextSteps: data.nextSteps,
    attachments: data.attachments,
  });

  // Update task progress & status accordingly
  task.progress = data.progressPercentage;
  if (data.currentBlockers && data.currentBlockers.trim().length > 0) {
    task.status = 'Blocked';
  } else if (task.status === 'Blocked' || task.status === 'Assigned' || task.status === 'Acknowledged') {
    task.status = 'In Progress';
  }
  await task.save();

  // Notify reviewers / managers
  for (const reviewerId of task.reviewers) {
    await sendNotification({
      adminId: reviewerId,
      title: `Progress Update on ${task.taskId}`,
      message: `${req.admin?.fullName} submitted a ${data.updateType} update: ${data.progressPercentage}% progress`,
      link: `/tasks/${task.taskId}`,
    });
  }

  await createAuditLog({
    action: 'TASK_PROGRESS_UPDATED',
    entity: 'TaskUpdate',
    entityId: update.updateId,
    adminId: req.admin?._id,
    adminName: req.admin?.fullName,
    details: { taskId: task.taskId, progress: data.progressPercentage, updateType: data.updateType },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(201).json(ApiResponse.success('Progress update submitted successfully', update));
});

export const getTaskUpdates = asyncHandler(async (req: Request, res: Response) => {
  const taskId = String(req.params.taskId);
  const isMongoId = /^[0-9a-fA-F]{24}$/.test(taskId);
  const { page = 1, limit = 20 } = req.query;

  const pagination = getPagination({
    page: Number(page),
    limit: Number(limit),
  });

  const task = await Task.findOne({
    $or: [
      { taskId },
      ...(isMongoId ? [{ _id: taskId }] : []),
    ],
  });

  if (!task) {
    throw new ApiError(404, 'Task not found');
  }

  const [updates, total] = await Promise.all([
    TaskUpdate.find({ taskId: task._id })
      .populate('employeeId', 'fullName email department jobTitle')
      .populate('acknowledgedBy', 'fullName email')
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit),
    TaskUpdate.countDocuments({ taskId: task._id }),
  ]);

  pagination.total = total;
  pagination.totalPages = calculateTotalPages(total, pagination.limit);

  res.status(200).json(ApiResponse.success('Task updates retrieved', updates, pagination));
});

export const requestTaskUpdate = asyncHandler(async (req: Request, res: Response) => {
  const taskId = String(req.params.taskId);
  const isMongoId = /^[0-9a-fA-F]{24}$/.test(taskId);
  const { message = 'Please provide a progress update on this task.' } = req.body;

  const task = await Task.findOne({
    $or: [
      { taskId },
      ...(isMongoId ? [{ _id: taskId }] : []),
    ],
  });

  if (!task) {
    throw new ApiError(404, 'Task not found');
  }

  for (const assigneeId of task.assignedTo) {
    await sendNotification({
      adminId: assigneeId,
      title: `Update Requested: ${task.title}`,
      message: `${req.admin?.fullName} requested a task update: "${message}"`,
      type: 'warning',
      link: `/tasks/${task.taskId}`,
    });
  }

  await createAuditLog({
    action: 'TASK_UPDATE_REQUESTED',
    entity: 'Task',
    entityId: task.taskId,
    adminId: req.admin?._id,
    adminName: req.admin?.fullName,
    details: { message },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json(ApiResponse.success('Update request sent to task assignees', null));
});

export const acknowledgeUpdate = asyncHandler(async (req: Request, res: Response) => {
  const updateId = String(req.params.updateId);
  const { feedback } = req.body;

  const update = await TaskUpdate.findOne({ updateId });
  if (!update) {
    throw new ApiError(404, 'Update not found');
  }

  update.acknowledgedBy = req.admin?._id as any;
  update.acknowledgedAt = new Date();
  if (feedback) {
    update.managerFeedback = feedback;
  }
  await update.save();

  await sendNotification({
    adminId: update.employeeId,
    title: `Progress Update Acknowledged`,
    message: `${req.admin?.fullName} acknowledged your progress update on task ${update.taskCode}`,
    type: 'success',
  });

  res.status(200).json(ApiResponse.success('Update acknowledged', update));
});
