import mongoose from 'mongoose';
import { z } from 'zod';
import Admin from '../models/Admin.js';
import Task from '../models/Task.js';
import TaskUpdate from '../models/TaskUpdate.js';
import Ticket from '../models/Ticket.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createAuditLog } from '../services/audit.service.js';
import { sendNotification } from '../services/notification.service.js';
import { getEffectivePermissions } from '../middleware/permission.middleware.js';
import { PERMISSIONS } from '../config/permissions.js';
function isValidObjectId(id) {
    if (typeof id !== 'string')
        return false;
    return mongoose.Types.ObjectId.isValid(id) && /^[0-9a-fA-F]{24}$/.test(id);
}
// ==========================================
// 1. EMPLOYEE DASHBOARD
// ==========================================
export const getEmployeeDashboard = asyncHandler(async (req, res) => {
    const employeeId = req.admin?._id;
    if (!employeeId)
        throw new ApiError(401, 'Unauthorized');
    const empObjId = new mongoose.Types.ObjectId(employeeId);
    const [totalAssignedTasks, pendingTasks, inProgressTasks, completedTasks, pendingResourceRequests, openTickets, recentTasks, recentRequests,] = await Promise.all([
        Task.countDocuments({ assignedTo: empObjId }),
        Task.countDocuments({ assignedTo: empObjId, status: { $in: ['Draft', 'Assigned', 'Acknowledged'] } }),
        Task.countDocuments({ assignedTo: empObjId, status: { $in: ['In Progress', 'Blocked', 'Submitted for Review', 'Revision Requested'] } }),
        Task.countDocuments({ assignedTo: empObjId, status: { $in: ['Completed', 'Approved'] } }),
        Ticket.countDocuments({ requesterId: empObjId, ticketType: 'Resource Request', status: { $in: ['Open', 'Under Review', 'In Progress'] } }),
        Ticket.countDocuments({ requesterId: empObjId, status: { $in: ['Open', 'In Progress', 'Under Review', 'Additional Info Required'] } }),
        Task.find({ assignedTo: empObjId })
            .sort({ updatedAt: -1 })
            .limit(5)
            .select('taskId title status priority progress dueDate updatedAt'),
        Ticket.find({ requesterId: empObjId })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('id title ticketType category status priority createdAt resourceDetails'),
    ]);
    res.status(200).json(ApiResponse.success('Employee dashboard retrieved successfully', {
        employee: {
            id: employeeId,
            fullName: req.admin?.fullName,
            role: req.admin?.role,
        },
        stats: {
            totalAssignedTasks,
            pendingTasks,
            inProgressTasks,
            completedTasks,
            pendingResourceRequests,
            openTickets,
        },
        recentActivity: {
            tasks: recentTasks,
            requests: recentRequests,
        },
    }));
});
// ==========================================
// 2. MY ASSIGNED TASKS
// ==========================================
export const getMyTasks = asyncHandler(async (req, res) => {
    const employeeId = req.admin?._id;
    if (!employeeId)
        throw new ApiError(401, 'Unauthorized');
    const empObjId = new mongoose.Types.ObjectId(employeeId);
    const { status, priority, search } = req.query;
    const query = { assignedTo: empObjId };
    if (status && status !== 'All') {
        query.status = status;
    }
    if (priority && priority !== 'All') {
        query.priority = priority;
    }
    if (search) {
        query.$or = [
            { taskId: { $regex: String(search), $options: 'i' } },
            { title: { $regex: String(search), $options: 'i' } },
            { description: { $regex: String(search), $options: 'i' } },
        ];
    }
    const tasks = await Task.find(query)
        .populate('createdBy', 'fullName email')
        .populate('reviewers', 'fullName email')
        .sort({ updatedAt: -1 });
    res.status(200).json(ApiResponse.success('My tasks retrieved successfully', tasks));
});
export const getMyTaskById = asyncHandler(async (req, res) => {
    const employeeId = req.admin?._id;
    const { id } = req.params;
    const isMongoId = isValidObjectId(id);
    const task = await Task.findOne({
        $or: [{ taskId: id }, ...(isMongoId ? [{ _id: id }] : [])],
    })
        .populate('createdBy', 'fullName email')
        .populate('assignedTo', 'fullName email department jobTitle')
        .populate('reviewers', 'fullName email');
    if (!task) {
        throw new ApiError(404, 'Task not found');
    }
    const empObjId = new mongoose.Types.ObjectId(employeeId);
    const isAssigned = task.assignedTo.some((uid) => uid._id?.toString() === employeeId || uid.toString() === employeeId);
    // If not assigned, verify if user has admin/view all permission
    if (!isAssigned) {
        const { isSuperAdmin, permissions } = await getEffectivePermissions(employeeId);
        if (!isSuperAdmin && !permissions.has(PERMISSIONS.TASKS_VIEW_TEAM)) {
            throw new ApiError(403, 'Forbidden: You are not assigned to this task');
        }
    }
    // Fetch progress update history for this task
    const updates = await TaskUpdate.find({ taskId: task._id }).sort({ createdAt: -1 });
    res.status(200).json(ApiResponse.success('Task details retrieved', {
        task,
        updates,
    }));
});
const submitProgressSchema = z.object({
    progressPercentage: z.number().min(0).max(100),
    workCompleted: z.string().min(1, 'Summary of work completed is required'),
    workRemaining: z.string().optional(),
    currentBlockers: z.string().optional(),
    nextSteps: z.string().optional(),
    updateType: z.enum(['Daily', 'Milestone', 'Weekly', 'On-Demand', 'Blocker', 'Submission']).default('On-Demand'),
    readyForReview: z.boolean().optional(),
});
export const submitTaskProgress = asyncHandler(async (req, res) => {
    const employeeId = req.admin?._id;
    const { id } = req.params;
    const parsed = submitProgressSchema.parse(req.body);
    const isMongoId = isValidObjectId(id);
    const task = await Task.findOne({
        $or: [{ taskId: id }, ...(isMongoId ? [{ _id: id }] : [])],
    });
    if (!task) {
        throw new ApiError(404, 'Task not found');
    }
    // Validate that the employee is assigned to the task
    const isAssigned = task.assignedTo.some((uid) => uid.toString() === employeeId);
    if (!isAssigned) {
        throw new ApiError(403, 'Forbidden: You can only submit progress updates for tasks assigned to you');
    }
    const count = await TaskUpdate.countDocuments();
    const updateId = `UPD-${String(count + 1).padStart(3, '0')}`;
    const update = await TaskUpdate.create({
        updateId,
        taskId: task._id,
        taskCode: task.taskId,
        employeeId: new mongoose.Types.ObjectId(employeeId),
        employeeName: req.admin?.fullName || 'Employee',
        updateType: parsed.currentBlockers && parsed.currentBlockers.trim() ? 'Blocker' : parsed.updateType,
        progressPercentage: parsed.progressPercentage,
        workCompleted: parsed.workCompleted,
        workRemaining: parsed.workRemaining,
        currentBlockers: parsed.currentBlockers,
        nextSteps: parsed.nextSteps,
    });
    // Update task status and progress
    task.progress = parsed.progressPercentage;
    if (parsed.readyForReview || parsed.updateType === 'Submission' || parsed.progressPercentage === 100) {
        task.status = 'Submitted for Review';
    }
    else if (parsed.currentBlockers && parsed.currentBlockers.trim().length > 0) {
        task.status = 'Blocked';
    }
    else if (task.status === 'Assigned' || task.status === 'Acknowledged' || task.status === 'Blocked') {
        task.status = 'In Progress';
    }
    await task.save();
    // Notify task creator and reviewers
    if (task.createdBy) {
        await sendNotification({
            adminId: task.createdBy.toString(),
            title: `Progress Update on ${task.taskId}`,
            message: `${req.admin?.fullName} updated progress to ${parsed.progressPercentage}% (${task.status})`,
            link: `/tasks/${task.taskId}`,
        });
    }
    await createAuditLog({
        action: 'EMPLOYEE_TASK_PROGRESS_UPDATED',
        entity: 'Task',
        entityId: task.taskId,
        adminId: employeeId,
        adminName: req.admin?.fullName,
        details: { progress: parsed.progressPercentage, status: task.status, updateId },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
    });
    res.status(201).json(ApiResponse.success('Progress update submitted successfully', update));
});
// ==========================================
// 3. RESOURCE & REQUIREMENT REQUESTS
// ==========================================
const createRequestSchema = z.object({
    title: z.string().min(1, 'Request title is required'),
    category: z.enum(['Hardware', 'Software', 'Development Tools', 'Access Permissions', 'Project Resources', 'Documentation', 'Other Work Requirements', 'Technical', 'Resource', 'Requirement']).default('Resource'),
    resourceType: z.enum(['Software', 'Hardware', 'Cloud/Hosting', 'API Credits', 'Database', 'Access/License', 'Budget', 'Team Member', 'Training', 'Other']).default('Software'),
    description: z.string().min(1, 'Description is required'),
    businessJustification: z.string().min(1, 'Business justification is required'),
    priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).default('Medium'),
    requiredBy: z.string().optional(),
    quantity: z.number().min(1).default(1),
    relatedTaskId: z.string().optional(),
});
export const getMyRequests = asyncHandler(async (req, res) => {
    const employeeId = req.admin?._id;
    if (!employeeId)
        throw new ApiError(401, 'Unauthorized');
    const empObjId = new mongoose.Types.ObjectId(employeeId);
    const requests = await Ticket.find({
        requesterId: empObjId,
        ticketType: { $in: ['Resource Request', 'Requirement Request'] },
    }).sort({ createdAt: -1 });
    res.status(200).json(ApiResponse.success('My resource requests retrieved successfully', requests));
});
export const createRequest = asyncHandler(async (req, res) => {
    const employeeId = req.admin?._id;
    if (!employeeId)
        throw new ApiError(401, 'Unauthorized');
    const parsed = createRequestSchema.parse(req.body);
    const count = await Ticket.countDocuments();
    const requestId = `REQ-${String(count + 1).padStart(3, '0')}`;
    let relatedTaskObjectId;
    let relatedTaskCode;
    if (parsed.relatedTaskId) {
        const isMongoId = isValidObjectId(parsed.relatedTaskId);
        const foundTask = await Task.findOne({
            $or: [{ taskId: parsed.relatedTaskId }, ...(isMongoId ? [{ _id: parsed.relatedTaskId }] : [])],
        });
        if (foundTask) {
            relatedTaskObjectId = foundTask._id;
            relatedTaskCode = foundTask.taskId;
        }
    }
    const ticket = await Ticket.create({
        id: requestId,
        title: parsed.title,
        ticketType: 'Resource Request',
        category: parsed.category === 'Requirement' ? 'Requirement' : 'Resource',
        priority: parsed.priority,
        status: 'Open',
        description: parsed.description,
        reason: parsed.businessJustification,
        requesterId: new mongoose.Types.ObjectId(employeeId),
        requesterName: req.admin?.fullName || 'Employee',
        relatedTaskId: relatedTaskObjectId,
        relatedTaskCode,
        resourceDetails: {
            resourceType: parsed.resourceType,
            resourceName: parsed.title,
            businessJustification: parsed.businessJustification,
            quantity: parsed.quantity,
            requiredBy: parsed.requiredBy ? new Date(parsed.requiredBy) : undefined,
            allocationStatus: 'Unallocated',
        },
        createdBy: req.admin?.email,
    });
    // Notify Super Admins
    const superAdmins = await Admin.find({ role: 'Super Admin', isActive: true });
    for (const sa of superAdmins) {
        await sendNotification({
            adminId: sa._id,
            title: `New Employee Requisition: ${ticket.id}`,
            message: `${req.admin?.fullName} submitted a requirement request for "${parsed.title}" (Priority: ${parsed.priority})`,
            type: 'info',
            link: `/resources/${ticket.id}`,
        });
    }
    await createAuditLog({
        action: 'EMPLOYEE_RESOURCE_REQUEST_CREATED',
        entity: 'Ticket',
        entityId: ticket.id,
        adminId: employeeId,
        adminName: req.admin?.fullName,
        details: { resourceType: parsed.resourceType, priority: parsed.priority },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
    });
    res.status(201).json(ApiResponse.success('Resource request submitted successfully', ticket));
});
// ==========================================
// 4. EMPLOYEE TICKETS (SUPPORT & BLOCKERS)
// ==========================================
const createTicketSchema = z.object({
    title: z.string().min(1, 'Ticket title is required'),
    ticketType: z.enum(['Technical Support', 'Task Blocker', 'Requirement Request', 'Resource Request']).default('Technical Support'),
    category: z.enum(['Technical', 'Finance', 'Seller', 'Customer', 'Requirement', 'Resource', 'Other']).default('Technical'),
    priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).default('Medium'),
    description: z.string().min(1, 'Description is required'),
    reason: z.string().optional(),
    relatedTaskId: z.string().optional(),
});
export const getMyTickets = asyncHandler(async (req, res) => {
    const employeeId = req.admin?._id;
    if (!employeeId)
        throw new ApiError(401, 'Unauthorized');
    const empObjId = new mongoose.Types.ObjectId(employeeId);
    const tickets = await Ticket.find({
        requesterId: empObjId,
    }).sort({ createdAt: -1 });
    res.status(200).json(ApiResponse.success('My tickets retrieved successfully', tickets));
});
export const getMyTicketById = asyncHandler(async (req, res) => {
    const employeeId = req.admin?._id;
    const { id } = req.params;
    const ticket = await Ticket.findOne({ id })
        .populate('requesterId', 'fullName email department')
        .populate('assignedId', 'fullName email')
        .populate('relatedTaskId', 'taskId title status');
    if (!ticket) {
        throw new ApiError(404, 'Ticket not found');
    }
    // Security: only requester or assigned or admin can access
    const isRequester = ticket.requesterId?._id?.toString() === employeeId || ticket.requesterId?.toString() === employeeId;
    const isAssigned = ticket.assignedId?._id?.toString() === employeeId || ticket.assignedId?.toString() === employeeId;
    if (!isRequester && !isAssigned) {
        const { isSuperAdmin, permissions } = await getEffectivePermissions(employeeId);
        if (!isSuperAdmin && !permissions.has(PERMISSIONS.TICKETS_VIEW)) {
            throw new ApiError(403, 'Forbidden: You can only view your own tickets');
        }
    }
    res.status(200).json(ApiResponse.success('Ticket details retrieved successfully', ticket));
});
export const createTicket = asyncHandler(async (req, res) => {
    const employeeId = req.admin?._id;
    if (!employeeId)
        throw new ApiError(401, 'Unauthorized');
    const parsed = createTicketSchema.parse(req.body);
    const count = await Ticket.countDocuments();
    const ticketId = `TCK-${String(count + 1).padStart(3, '0')}`;
    let relatedTaskObjectId;
    let relatedTaskCode;
    if (parsed.relatedTaskId) {
        const isMongoId = isValidObjectId(parsed.relatedTaskId);
        const foundTask = await Task.findOne({
            $or: [{ taskId: parsed.relatedTaskId }, ...(isMongoId ? [{ _id: parsed.relatedTaskId }] : [])],
        });
        if (foundTask) {
            relatedTaskObjectId = foundTask._id;
            relatedTaskCode = foundTask.taskId;
        }
    }
    const ticket = await Ticket.create({
        id: ticketId,
        title: parsed.title,
        ticketType: parsed.ticketType,
        category: parsed.category,
        priority: parsed.priority,
        status: 'Open',
        description: parsed.description,
        reason: parsed.reason,
        requesterId: new mongoose.Types.ObjectId(employeeId),
        requesterName: req.admin?.fullName || 'Employee',
        relatedTaskId: relatedTaskObjectId,
        relatedTaskCode,
        createdBy: req.admin?.email,
    });
    await createAuditLog({
        action: 'EMPLOYEE_TICKET_CREATED',
        entity: 'Ticket',
        entityId: ticket.id,
        adminId: employeeId,
        adminName: req.admin?.fullName,
        details: { ticketType: parsed.ticketType, priority: parsed.priority },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
    });
    res.status(201).json(ApiResponse.success('Ticket created successfully', ticket));
});
export const addTicketComment = asyncHandler(async (req, res) => {
    const employeeId = req.admin?._id;
    const { id } = req.params;
    const { text } = req.body;
    if (!text || !String(text).trim()) {
        throw new ApiError(400, 'Comment text is required');
    }
    const ticket = await Ticket.findOne({ id });
    if (!ticket) {
        throw new ApiError(404, 'Ticket not found');
    }
    // Security: only requester or assigned or admin can comment
    const isRequester = ticket.requesterId?.toString() === employeeId;
    const isAssigned = ticket.assignedId?.toString() === employeeId;
    if (!isRequester && !isAssigned) {
        const { isSuperAdmin, permissions } = await getEffectivePermissions(employeeId);
        if (!isSuperAdmin && !permissions.has(PERMISSIONS.TICKETS_VIEW)) {
            throw new ApiError(403, 'Forbidden: You can only reply to your own tickets');
        }
    }
    const newComment = {
        id: new mongoose.Types.ObjectId().toString(),
        text: String(text).trim(),
        author: req.admin?.fullName || 'Employee',
        authorId: new mongoose.Types.ObjectId(employeeId),
        isInternal: false,
        createdAt: new Date(),
    };
    ticket.comments.push(newComment);
    await ticket.save();
    res.status(200).json(ApiResponse.success('Comment added successfully', newComment));
});
// ==========================================
// 5. EMPLOYEE PROFILE
// ==========================================
export const getMyProfile = asyncHandler(async (req, res) => {
    const employeeId = req.admin?._id;
    const admin = await Admin.findById(employeeId).select('-password');
    if (!admin) {
        throw new ApiError(404, 'Employee record not found');
    }
    const { permissions } = await getEffectivePermissions(employeeId);
    res.status(200).json(ApiResponse.success('Profile retrieved successfully', {
        id: admin._id,
        fullName: admin.fullName,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        department: admin.department,
        jobTitle: admin.jobTitle,
        location: admin.location,
        bio: admin.bio,
        status: admin.status,
        employeeId: admin.employeeId,
        employeeSerial: admin.employeeSerial,
        permissions: Array.from(permissions),
        lastLogin: admin.lastLogin,
        createdAt: admin.createdAt,
    }));
});
export const updateMyProfile = asyncHandler(async (req, res) => {
    const employeeId = req.admin?._id;
    const { location, bio } = req.body;
    const admin = await Admin.findById(employeeId);
    if (!admin) {
        throw new ApiError(404, 'Employee record not found');
    }
    if (location !== undefined)
        admin.location = location;
    if (bio !== undefined)
        admin.bio = bio;
    await admin.save();
    res.status(200).json(ApiResponse.success('Profile updated successfully', {
        id: admin._id,
        fullName: admin.fullName,
        location: admin.location,
        bio: admin.bio,
    }));
});
