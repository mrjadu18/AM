import { Request, Response } from 'express';
import { z } from 'zod';
import Order from '../models/Order.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, calculateTotalPages } from '../utils/pagination.js';

const updateStatusSchema = z.object({
  status: z.enum(['Pending', 'Processing', 'Completed']),
});

export const getOrders = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 10, search = '', status = '', sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

  const pagination = getPagination({
    page: Number(page),
    limit: Number(limit),
    sortBy: String(sortBy),
    sortOrder: sortOrder as 'asc' | 'desc',
  });

  const query: any = {};

  if (search) {
    query.$or = [
      { id: { $regex: search, $options: 'i' } },
      { product: { $regex: search, $options: 'i' } },
      { customer: { $regex: search, $options: 'i' } },
      { seller: { $regex: search, $options: 'i' } },
    ];
  }

  if (status) {
    query.status = status;
  }

  const sortOptions: any = {};
  if (pagination.sortBy) {
    sortOptions[pagination.sortBy] = pagination.sortOrder === 'asc' ? 1 : -1;
  }

  const [orders, total] = await Promise.all([
    Order.find(query)
      .sort(sortOptions)
      .skip(pagination.skip)
      .limit(pagination.limit),
    Order.countDocuments(query),
  ]);

  pagination.total = total;
  pagination.totalPages = calculateTotalPages(total, pagination.limit);

  res.status(200).json(
    ApiResponse.success('Orders retrieved successfully', orders, pagination)
  );
});

export const getOrderById = asyncHandler(async (req: Request, res: Response) => {
  const order = await Order.findOne({ id: req.params.id });

  if (!order) {
    throw new ApiError(404, 'Order not found');
  }

  res.status(200).json(
    ApiResponse.success('Order retrieved successfully', order)
  );
});

export const updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = updateStatusSchema.parse(req.body);

  const order = await Order.findOneAndUpdate(
    { id: req.params.id },
    { status },
    { new: true, runValidators: true }
  );

  if (!order) {
    throw new ApiError(404, 'Order not found');
  }

  res.status(200).json(
    ApiResponse.success('Order status updated successfully', order)
  );
});
