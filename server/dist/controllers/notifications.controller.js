import { z } from 'zod';
import Notification from '../models/Notification.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, calculateTotalPages } from '../utils/pagination.js';
const createNotificationSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    message: z.string().min(1, 'Message is required'),
    type: z.enum(['info', 'success', 'warning', 'error']).default('info'),
});
export const getNotifications = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, isRead = '' } = req.query;
    const pagination = getPagination({
        page: Number(page),
        limit: Number(limit),
    });
    const query = {};
    if (isRead !== '') {
        query.isRead = isRead === 'true';
    }
    const [notifications, total] = await Promise.all([
        Notification.find(query)
            .sort({ createdAt: -1 })
            .skip(pagination.skip)
            .limit(pagination.limit),
        Notification.countDocuments(query),
    ]);
    pagination.total = total;
    pagination.totalPages = calculateTotalPages(total, pagination.limit);
    res.status(200).json(ApiResponse.success('Notifications retrieved successfully', notifications, pagination));
});
export const createNotification = asyncHandler(async (req, res) => {
    const data = createNotificationSchema.parse(req.body);
    const count = await Notification.countDocuments();
    const id = `NOT-${String(count + 1).padStart(3, '0')}`;
    const notification = await Notification.create({
        id,
        ...data,
        adminId: req.admin?._id,
    });
    res.status(201).json(ApiResponse.success('Notification created successfully', notification));
});
export const markAsRead = asyncHandler(async (req, res) => {
    const notification = await Notification.findByIdAndUpdate(req.params.id, { isRead: true }, { new: true });
    if (!notification) {
        throw new ApiError(404, 'Notification not found');
    }
    res.status(200).json(ApiResponse.success('Notification marked as read', notification));
});
export const markAllAsRead = asyncHandler(async (req, res) => {
    await Notification.updateMany({ adminId: req.admin?._id, isRead: false }, { isRead: true });
    res.status(200).json(ApiResponse.success('All notifications marked as read', null));
});
export const deleteNotification = asyncHandler(async (req, res) => {
    const notification = await Notification.findByIdAndDelete(req.params.id);
    if (!notification) {
        throw new ApiError(404, 'Notification not found');
    }
    res.status(200).json(ApiResponse.success('Notification deleted successfully', notification));
});
