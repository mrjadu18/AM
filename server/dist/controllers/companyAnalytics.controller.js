import Admin from '../models/Admin.js';
import Role from '../models/Role.js';
import Task from '../models/Task.js';
import Ticket from '../models/Ticket.js';
import Approval from '../models/Approval.js';
import AuditLog from '../models/AuditLog.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getEffectivePermissions } from '../middleware/permission.middleware.js';
export const getCompanyDashboard = asyncHandler(async (req, res) => {
    const currentUserId = req.admin?._id;
    const { isSuperAdmin, roleName } = await getEffectivePermissions(currentUserId);
    // Metrics calculation
    const [totalEmployees, activeEmployees, totalRoles, totalTasks, inProgressTasks, overdueTasks, blockedTasks, reviewPendingTasks, pendingApprovals, openTickets, resourceTickets, recentAudits, myAssignedTasks,] = await Promise.all([
        Admin.countDocuments(),
        Admin.countDocuments({ status: 'Active' }),
        Role.countDocuments(),
        Task.countDocuments(),
        Task.countDocuments({ status: 'In Progress' }),
        Task.countDocuments({ dueDate: { $lt: new Date() }, status: { $ne: 'Completed' } }),
        Task.countDocuments({ status: 'Blocked' }),
        Task.countDocuments({ status: 'Submitted for Review' }),
        Approval.countDocuments({ status: 'Pending' }),
        Ticket.countDocuments({ status: { $in: ['Open', 'In Progress', 'Under Review'] } }),
        Ticket.countDocuments({ ticketType: 'Resource Request' }),
        AuditLog.find().sort({ createdAt: -1 }).limit(10),
        Task.find({ assignedTo: currentUserId, status: { $ne: 'Completed' } }).limit(5),
    ]);
    // Tasks by priority
    const tasksByPriority = await Task.aggregate([
        { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);
    // Tasks by status
    const tasksByStatus = await Task.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    // Tickets by type
    const ticketsByType = await Ticket.aggregate([
        { $group: { _id: '$ticketType', count: { $sum: 1 } } }
    ]);
    res.status(200).json(ApiResponse.success('Company dashboard metrics retrieved', {
        userRole: roleName,
        isSuperAdmin,
        stats: {
            totalEmployees,
            activeEmployees,
            totalRoles,
            totalTasks,
            inProgressTasks,
            overdueTasks,
            blockedTasks,
            reviewPendingTasks,
            pendingApprovals,
            openTickets,
            resourceTickets,
        },
        tasksByPriority,
        tasksByStatus,
        ticketsByType,
        recentAudits,
        myAssignedTasks,
    }));
});
export const getTaskAnalytics = asyncHandler(async (req, res) => {
    const [statusDistribution, priorityDistribution, totalTasks, completedTasks] = await Promise.all([
        Task.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
        Task.aggregate([{ $group: { _id: '$priority', count: { $sum: 1 } } }]),
        Task.countDocuments(),
        Task.countDocuments({ status: 'Completed' }),
    ]);
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    res.status(200).json(ApiResponse.success('Task analytics retrieved', {
        totalTasks,
        completedTasks,
        completionRate,
        statusDistribution,
        priorityDistribution,
    }));
});
export const getTicketAnalytics = asyncHandler(async (req, res) => {
    const [typeDistribution, statusDistribution, resourceRequests] = await Promise.all([
        Ticket.aggregate([{ $group: { _id: '$ticketType', count: { $sum: 1 } } }]),
        Ticket.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
        Ticket.find({ ticketType: 'Resource Request' }).select('resourceDetails status createdAt'),
    ]);
    let totalEstimatedCost = 0;
    let fulfilledCount = 0;
    for (const r of resourceRequests) {
        if (r.resourceDetails?.estimatedCost) {
            totalEstimatedCost += r.resourceDetails.estimatedCost;
        }
        if (r.resourceDetails?.allocationStatus === 'Fulfilled') {
            fulfilledCount++;
        }
    }
    res.status(200).json(ApiResponse.success('Ticket analytics retrieved', {
        typeDistribution,
        statusDistribution,
        resourceSummary: {
            totalRequests: resourceRequests.length,
            fulfilledCount,
            totalEstimatedCost,
        },
    }));
});
