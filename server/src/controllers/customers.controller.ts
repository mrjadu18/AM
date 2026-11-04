import { Request, Response } from 'express';
import { z } from 'zod';
import Customer from '../models/Customer.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, calculateTotalPages } from '../utils/pagination.js';

const createCustomerSchema = z.object({
  name: z.string().min(1, 'Customer name is required'),
  email: z.string().email('Invalid email'),
  phone: z.string().optional(),
  orders: z.number().min(0).default(0),
  spent: z.number().min(0).default(0),
});

const updateCustomerSchema = z.object({
  name: z.string().min(1, 'Customer name is required').optional(),
  email: z.string().email('Invalid email').optional(),
  phone: z.string().optional(),
  orders: z.number().min(0).optional(),
  spent: z.number().min(0).optional(),
  status: z.enum(['Active', 'Inactive']).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['Active', 'Inactive']),
});

export const getCustomers = asyncHandler(async (req: Request, res: Response) => {
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
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  if (status) {
    query.status = status;
  }

  const sortOptions: any = {};
  if (pagination.sortBy) {
    sortOptions[pagination.sortBy] = pagination.sortOrder === 'asc' ? 1 : -1;
  }

  const [customers, total] = await Promise.all([
    Customer.find(query)
      .sort(sortOptions)
      .skip(pagination.skip)
      .limit(pagination.limit),
    Customer.countDocuments(query),
  ]);

  pagination.total = total;
  pagination.totalPages = calculateTotalPages(total, pagination.limit);

  res.status(200).json(
    ApiResponse.success('Customers retrieved successfully', customers, pagination)
  );
});

export const getCustomerById = asyncHandler(async (req: Request, res: Response) => {
  const customer = await Customer.findOne({ id: req.params.id });

  if (!customer) {
    throw new ApiError(404, 'Customer not found');
  }

  res.status(200).json(
    ApiResponse.success('Customer retrieved successfully', customer)
  );
});

export const createCustomer = asyncHandler(async (req: Request, res: Response) => {
  const data = createCustomerSchema.parse(req.body);

  const existingCustomer = await Customer.findOne({ email: data.email });
  if (existingCustomer) {
    throw new ApiError(400, 'Customer with this email already exists');
  }

  const count = await Customer.countDocuments();
  const id = `CUS-${String(count + 1).padStart(3, '0')}`;

  const customer = await Customer.create({
    id,
    ...data,
  });

  res.status(201).json(
    ApiResponse.success('Customer created successfully', customer)
  );
});

export const updateCustomer = asyncHandler(async (req: Request, res: Response) => {
  const updates = updateCustomerSchema.parse(req.body);

  const customer = await Customer.findOneAndUpdate(
    { id: req.params.id },
    { $set: updates },
    { new: true, runValidators: true }
  );

  if (!customer) {
    throw new ApiError(404, 'Customer not found');
  }

  res.status(200).json(
    ApiResponse.success('Customer updated successfully', customer)
  );
});

export const updateCustomerStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = updateStatusSchema.parse(req.body);

  const customer = await Customer.findOneAndUpdate(
    { id: req.params.id },
    { status },
    { new: true, runValidators: true }
  );

  if (!customer) {
    throw new ApiError(404, 'Customer not found');
  }

  res.status(200).json(
    ApiResponse.success('Customer status updated successfully', customer)
  );
});

export const deleteCustomer = asyncHandler(async (req: Request, res: Response) => {
  const customer = await Customer.findOneAndDelete({ id: req.params.id });

  if (!customer) {
    throw new ApiError(404, 'Customer not found');
  }

  res.status(200).json(
    ApiResponse.success('Customer deleted successfully', customer)
  );
});
