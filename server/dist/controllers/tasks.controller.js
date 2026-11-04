import { z } from 'zod';
import Task from '../models/Task.js';
import TaskUpdate from '../models/TaskUpdate.js';
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
const VALID_STATUS_TRANSITIONS = {
    Draft: ['Assigned'],
    Assigned: ['Acknowledged', 'In Progress', 'On Hold'],
    Acknowledged: ['In Progress', 'Blocked', 'On Hold'],
    'In Progress': ['Submitted for Review', 'Blocked', 'On Hold', 'Completed'],
    'On Hold': ['In Progress', 'Acknowledged', 'Draft'],
    Blocked: ['In Progress', 'On Hold', 'Submitted for Review'],
    'Submitted for Review': ['Revision Requested', 'Approved', 'Completed'],
    'Revision Requested': ['In Progress', 'Submitted for Review'],
    Approved: ['Completed'],
    Completed: ['In Progress', 'Assigned'], // Reopen if authorized
};
const createTaskSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().min(1, 'Description is required'),
    instructions: z.string().optional(),
    project: z.string().default('General Operations'),
    assignedTo: z.array(z.string()).default([]),
    reviewers: z.array(z.string()).default([]),
    priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).default('Medium'),
    startDate: z.string().optional(),
    dueDate: z.string().optional(),
    estimatedHours: z.number().min(0).default(0),
    milestones: z.array(z.object({
        title: z.string(),
        completed: z.boolean().default(false),
        dueDate: z.string().optional(),
    })).default([]),
    tags: z.array(z.string()).default([]),
    relatedTickets: z.array(z.string()).default([]),
});
const updateTaskSchema = z.object({
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    instructions: z.string().optional(),
    project: z.string().optional(),
    assignedTo: z.array(z.string()).optional(),
    reviewers: z.array(z.string()).optional(),
    priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).optional(),
    status: z.enum([
        'Draft', 'Assigned', 'Acknowledged', 'In Progress', 'On Hold',
        'Blocked', 'Submitted for Review', 'Revision Requested', 'Approved', 'Completed'
    ]).optional(),
    startDate: z.string().optional(),
    dueDate: z.string().optional(),
    estimatedHours: z.number().optional(),
    actualHours: z.number().optional(),
    progress: z.number().min(0).max(100).optional(),
    milestones: z.array(z.object({
        title: z.string(),
        completed: z.boolean(),
        dueDate: z.string().optional(),
    })).optional(),
    tags: z.array(z.string()).optional(),
    completionEvidence: z.string().optional(),
    reviewFeedback: z.string().optional(),
});
export const getTasks = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, search = '', status = '', priority = '', project = '', employeeId = '', scope = 'all', // 'all' | 'my' | 'review'
     } = req.query;
    const currentUserId = req.admin?._id;
    const { isSuperAdmin, permissions } = await getEffectivePermissions(currentUserId);
    const pagination = getPagination({
        page: Number(page),
        limit: Number(limit),
    });
    const query = {};
    // Scope enforcement
    if (scope === 'my' || (!isSuperAdmin && !permissions.has(PERMISSIONS.TASKS_VIEW_TEAM) && !permissions.has(PERMISSIONS.TASKS_CREATE))) {
        query.assignedTo = currentUserId;
    }
    else if (scope === 'review') {
        query.$or = [{ reviewers: currentUserId }, { status: 'Submitted for Review' }];
    }
    else if (employeeId) {
        query.assignedTo = employeeId;
    }
    if (search) {
        query.$or = [
            { taskId: { $regex: search, $options: 'i' } },
            { title: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { project: { $regex: search, $options: 'i' } },
            { assignedToNames: { $regex: search, $options: 'i' } },
        ];
    }
    if (status)
        query.status = status;
    if (priority)
        query.priority = priority;
    if (project)
        query.project = project;
    const [tasks, total] = await Promise.all([
        Task.find(query)
            .populate('assignedTo', 'fullName email department jobTitle')
            .populate('reviewers', 'fullName email')
            .populate('createdBy', 'fullName email')
            .sort({ createdAt: -1 })
            .skip(pagination.skip)
            .limit(pagination.limit),
        Task.countDocuments(query),
    ]);
    pagination.total = total;
    pagination.totalPages = calculateTotalPages(total, pagination.limit);
    res.status(200).json(ApiResponse.success('Tasks retrieved successfully', tasks, pagination));
});
export const getTaskById = asyncHandler(async (req, res) => {
    const idParam = String(req.params.id);
    const isMongoId = /^[0-9a-fA-F]{24}$/.test(idParam);
    const task = await Task.findOne({
        $or: [
            { taskId: idParam },
            ...(isMongoId ? [{ _id: idParam }] : []),
        ],
    })
        .populate('assignedTo', 'fullName email department jobTitle')
        .populate('reviewers', 'fullName email')
        .populate('createdBy', 'fullName email');
    if (!task) {
        throw new ApiError(404, 'Task not found');
    }
    const updates = await TaskUpdate.find({ taskId: task._id }).sort({ createdAt: -1 });
    const attachments = await FileAsset.find({ ownerType: 'task', ownerId: task.taskId });
    task.attachments = attachments;
    res.status(200).json(ApiResponse.success('Task details retrieved', {
        task,
        updates,
    }));
});
export const createTask = asyncHandler(async (req, res) => {
    const data = createTaskSchema.parse(req.body);
    const count = await Task.countDocuments();
    const taskId = `TSK-${String(count + 1).padStart(3, '0')}`;
    const assignedUsers = await Admin.find({ _id: { $in: data.assignedTo } });
    const assignedToNames = assignedUsers.map((u) => u.fullName);
    const reviewersList = data.reviewers.length > 0
        ? data.reviewers
        : (req.admin?._id ? [req.admin._id] : []);
    const newTask = await Task.create({
        taskId,
        title: data.title,
        description: data.description,
        instructions: data.instructions,
        project: data.project,
        assignedTo: data.assignedTo,
        assignedToNames,
        reviewers: reviewersList,
        createdBy: req.admin?._id,
        createdByName: req.admin?.fullName,
        priority: data.priority,
        status: 'Assigned',
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        estimatedHours: data.estimatedHours,
        milestones: data.milestones,
        tags: data.tags,
        relatedTickets: data.relatedTickets,
        progress: 0,
    });
    // Notify assignees
    for (const user of assignedUsers) {
        await sendNotification({
            adminId: user._id,
            title: 'New Task Assigned',
            message: `You have been assigned to task: ${newTask.title} (${newTask.taskId})`,
            link: `/tasks/${newTask.taskId}`,
        });
    }
    await createAuditLog({
        action: 'TASK_CREATED',
        entity: 'Task',
        entityId: newTask.taskId,
        adminId: req.admin?._id,
        adminName: req.admin?.fullName,
        details: { taskId: newTask.taskId, title: newTask.title, assignees: assignedToNames },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
    });
    res.status(201).json(ApiResponse.success('Task created successfully', newTask));
});
export const updateTask = asyncHandler(async (req, res) => {
    const updates = updateTaskSchema.parse(req.body);
    const idParam = String(req.params.id);
    const isMongoId = /^[0-9a-fA-F]{24}$/.test(idParam);
    const task = await Task.findOne({
        $or: [
            { taskId: idParam },
            ...(isMongoId ? [{ _id: idParam }] : []),
        ],
    });
    if (!task) {
        throw new ApiError(404, 'Task not found');
    }
    // Validate status transition if status is being updated
    if (updates.status && updates.status !== task.status) {
        const allowedTransitions = VALID_STATUS_TRANSITIONS[task.status] || [];
        if (!allowedTransitions.includes(updates.status)) {
            throw new ApiError(400, `Invalid status transition from "${task.status}" to "${updates.status}". Allowed: ${allowedTransitions.join(', ')}`);
        }
    }
    // If reassigning, update names and notify new assignees
    if (updates.assignedTo) {
        const assignedUsers = await Admin.find({ _id: { $in: updates.assignedTo } });
        task.assignedToNames = assignedUsers.map((u) => u.fullName);
        task.assignedTo = updates.assignedTo;
        for (const u of assignedUsers) {
            await sendNotification({
                adminId: u._id,
                title: 'Task Assignment Updated',
                message: `Task assignment updated: ${task.title} (${task.taskId})`,
                link: `/tasks/${task.taskId}`,
            });
        }
    }
    Object.assign(task, updates);
    await task.save();
    await createAuditLog({
        action: 'TASK_UPDATED',
        entity: 'Task',
        entityId: task.taskId,
        adminId: req.admin?._id,
        adminName: req.admin?.fullName,
        details: updates,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
    });
    res.status(200).json(ApiResponse.success('Task updated successfully', task));
});
export const acknowledgeTask = asyncHandler(async (req, res) => {
    const idParam = String(req.params.id);
    const isMongoId = /^[0-9a-fA-F]{24}$/.test(idParam);
    const task = await Task.findOne({
        $or: [
            { taskId: idParam },
            ...(isMongoId ? [{ _id: idParam }] : []),
        ],
    });
    if (!task) {
        throw new ApiError(404, 'Task not found');
    }
    task.status = 'Acknowledged';
    task.acknowledgedAt = new Date();
    await task.save();
    await createAuditLog({
        action: 'TASK_ACKNOWLEDGED',
        entity: 'Task',
        entityId: task.taskId,
        adminId: req.admin?._id,
        adminName: req.admin?.fullName,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
    });
    res.status(200).json(ApiResponse.success('Task acknowledged', task));
});
export const submitTaskForReview = asyncHandler(async (req, res) => {
    const { completionEvidence = '', notes = '' } = req.body;
    const idParam = String(req.params.id);
    const isMongoId = /^[0-9a-fA-F]{24}$/.test(idParam);
    const task = await Task.findOne({
        $or: [
            { taskId: idParam },
            ...(isMongoId ? [{ _id: idParam }] : []),
        ],
    });
    if (!task) {
        throw new ApiError(404, 'Task not found');
    }
    task.status = 'Submitted for Review';
    task.completionEvidence = completionEvidence;
    task.progress = 100;
    task.submittedAt = new Date();
    await task.save();
    // Create approval record
    const approvalCount = await Approval.countDocuments();
    const approvalId = `APP-${String(approvalCount + 1).padStart(3, '0')}`;
    await Approval.create({
        approvalId,
        approvalType: 'Task Completion',
        title: `Review Task: ${task.title}`,
        description: notes || completionEvidence,
        referenceModel: 'Task',
        referenceId: task._id,
        referenceCode: task.taskId,
        requesterId: req.admin?._id,
        requesterName: req.admin?.fullName,
        status: 'Pending',
    });
    // Notify reviewers
    for (const reviewerId of task.reviewers) {
        await sendNotification({
            adminId: reviewerId,
            title: 'Task Submitted for Review',
            message: `${req.admin?.fullName} submitted task "${task.title}" for review`,
            link: `/tasks/${task.taskId}`,
        });
    }
    await createAuditLog({
        action: 'TASK_SUBMITTED_FOR_REVIEW',
        entity: 'Task',
        entityId: task.taskId,
        adminId: req.admin?._id,
        adminName: req.admin?.fullName,
        details: { completionEvidence, notes },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
    });
    res.status(200).json(ApiResponse.success('Task submitted for review', task));
});
export const reviewTask = asyncHandler(async (req, res) => {
    const { decision, feedback } = req.body; // 'approve' | 'request_revision'
    const idParam = String(req.params.id);
    const isMongoId = /^[0-9a-fA-F]{24}$/.test(idParam);
    if (!['approve', 'request_revision'].includes(decision)) {
        throw new ApiError(400, 'Invalid decision. Must be "approve" or "request_revision"');
    }
    const task = await Task.findOne({
        $or: [
            { taskId: idParam },
            ...(isMongoId ? [{ _id: idParam }] : []),
        ],
    });
    if (!task) {
        throw new ApiError(404, 'Task not found');
    }
    if (decision === 'approve') {
        task.status = 'Completed';
        task.approvedAt = new Date();
        task.completedAt = new Date();
        task.reviewFeedback = feedback || 'Approved';
        // Update approval record if exists
        await Approval.findOneAndUpdate({ referenceId: task._id, referenceModel: 'Task' }, {
            $set: {
                status: 'Approved',
                decisionBy: req.admin?._id,
                decisionByName: req.admin?.fullName,
                decisionNotes: feedback,
                decidedAt: new Date(),
            },
        });
        for (const assignee of task.assignedTo) {
            await sendNotification({
                adminId: assignee,
                title: 'Task Completion Approved! 🎉',
                message: `Your task "${task.title}" was approved by ${req.admin?.fullName}`,
                type: 'success',
                link: `/tasks/${task.taskId}`,
            });
        }
    }
    else {
        task.status = 'Revision Requested';
        task.reviewFeedback = feedback || 'Revision required';
        await Approval.findOneAndUpdate({ referenceId: task._id, referenceModel: 'Task' }, {
            $set: {
                status: 'Needs Information',
                decisionBy: req.admin?._id,
                decisionByName: req.admin?.fullName,
                decisionNotes: feedback,
                decidedAt: new Date(),
            },
        });
        for (const assignee of task.assignedTo) {
            await sendNotification({
                adminId: assignee,
                title: 'Task Revision Requested',
                message: `Task "${task.title}" requires revisions: ${feedback}`,
                type: 'warning',
                link: `/tasks/${task.taskId}`,
            });
        }
    }
    await task.save();
    await createAuditLog({
        action: decision === 'approve' ? 'TASK_APPROVED' : 'TASK_REVISION_REQUESTED',
        entity: 'Task',
        entityId: task.taskId,
        adminId: req.admin?._id,
        adminName: req.admin?.fullName,
        details: { decision, feedback },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
    });
    res.status(200).json(ApiResponse.success(`Task review recorded: ${task.status}`, task));
});
export const deleteTask = asyncHandler(async (req, res) => {
    const idParam = String(req.params.id);
    const isMongoId = /^[0-9a-fA-F]{24}$/.test(idParam);
    const task = await Task.findOneAndDelete({
        $or: [
            { taskId: idParam },
            ...(isMongoId ? [{ _id: idParam }] : []),
        ],
    });
    if (!task) {
        throw new ApiError(404, 'Task not found');
    }
    await createAuditLog({
        action: 'TASK_DELETED',
        entity: 'Task',
        entityId: task.taskId,
        adminId: req.admin?._id,
        adminName: req.admin?.fullName,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
    });
    res.status(200).json(ApiResponse.success('Task deleted successfully', null));
});
export const uploadTaskAttachments = asyncHandler(async (req, res) => {
    const task = await Task.findOne({ taskId: req.params.id });
    if (!task)
        throw new ApiError(404, 'Task not found');
    const allowed = task.assignedTo.some((user) => user.toString() === req.admin?._id) || task.reviewers.some((user) => user.toString() === req.admin?._id) || req.admin?.role === 'Super Admin';
    if (!allowed)
        throw new ApiError(403, 'You are not authorized to attach files to this task');
    const files = req.files || [];
    const assets = [];
    for (const file of files) {
        validateUpload(file);
        const stored = persistUpload(file);
        assets.push(await FileAsset.create({ fileId: `FIL-${Date.now()}-${assets.length}`, originalName: file.originalname, storedName: stored.storedName, mimeType: file.mimetype, size: file.size, ownerType: 'task', ownerId: task.taskId, kind: req.admin?.role === 'Super Admin' ? 'reference' : 'evidence', uploadedBy: req.admin?._id, uploadedByName: req.admin?.fullName }));
    }
    res.status(201).json(ApiResponse.success('Task attachments uploaded', assets));
});
export const downloadTaskAttachment = asyncHandler(async (req, res) => { const task = await Task.findOne({ taskId: req.params.id }); const asset = await FileAsset.findOne({ fileId: req.params.fileId, ownerType: 'task', ownerId: req.params.id }); if (!task || !asset)
    throw new ApiError(404, 'Attachment not found'); const allowed = task.assignedTo.some(u => u.toString() === req.admin?._id) || task.reviewers.some(u => u.toString() === req.admin?._id) || req.admin?.role === 'Super Admin'; if (!allowed)
    throw new ApiError(403, 'Not authorized'); res.setHeader('Content-Type', asset.mimeType); res.sendFile(resolveStoredFile(asset.storedName)); });
