import { z } from 'zod';
import Seller from '../models/Seller.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, calculateTotalPages } from '../utils/pagination.js';
const createSellerSchema = z.object({
    name: z.string().min(1, 'Business name is required'),
    owner: z.string().min(1, 'Owner name is required'),
    email: z.string().email('Invalid email'),
    category: z.string().min(1, 'Category is required'),
    phone: z.string().optional(),
    address: z.string().optional(),
});
const updateSellerSchema = z.object({
    name: z.string().min(1, 'Business name is required').optional(),
    owner: z.string().min(1, 'Owner name is required').optional(),
    email: z.string().email('Invalid email').optional(),
    category: z.string().min(1, 'Category is required').optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    commissionRate: z.number().min(0).max(100).optional(),
});
const updateStatusSchema = z.object({
    status: z.enum(['Pending', 'Active', 'Blocked']),
});
export const getSellers = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, search = '', status = '', sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const pagination = getPagination({
        page: Number(page),
        limit: Number(limit),
        sortBy: String(sortBy),
        sortOrder: sortOrder,
    });
    const query = {};
    if (search) {
        query.$or = [
            { id: { $regex: search, $options: 'i' } },
            { name: { $regex: search, $options: 'i' } },
            { owner: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
        ];
    }
    if (status) {
        query.status = status;
    }
    const sortOptions = {};
    if (pagination.sortBy) {
        sortOptions[pagination.sortBy] = pagination.sortOrder === 'asc' ? 1 : -1;
    }
    const [sellers, total] = await Promise.all([
        Seller.find(query)
            .sort(sortOptions)
            .skip(pagination.skip)
            .limit(pagination.limit),
        Seller.countDocuments(query),
    ]);
    pagination.total = total;
    pagination.totalPages = calculateTotalPages(total, pagination.limit);
    res.status(200).json(ApiResponse.success('Sellers retrieved successfully', sellers, pagination));
});
export const getSellerById = asyncHandler(async (req, res) => {
    const seller = await Seller.findOne({ id: req.params.id });
    if (!seller) {
        throw new ApiError(404, 'Seller not found');
    }
    res.status(200).json(ApiResponse.success('Seller retrieved successfully', seller));
});
export const createSeller = asyncHandler(async (req, res) => {
    const data = createSellerSchema.parse(req.body);
    const existingSeller = await Seller.findOne({ email: data.email });
    if (existingSeller) {
        throw new ApiError(400, 'Seller with this email already exists');
    }
    const count = await Seller.countDocuments();
    const id = `SEL-${String(count + 1).padStart(3, '0')}`;
    const seller = await Seller.create({
        id,
        ...data,
    });
    res.status(201).json(ApiResponse.success('Seller created successfully', seller));
});
export const updateSeller = asyncHandler(async (req, res) => {
    const updates = updateSellerSchema.parse(req.body);
    const seller = await Seller.findOneAndUpdate({ id: req.params.id }, { $set: updates }, { new: true, runValidators: true });
    if (!seller) {
        throw new ApiError(404, 'Seller not found');
    }
    res.status(200).json(ApiResponse.success('Seller updated successfully', seller));
});
export const updateSellerStatus = asyncHandler(async (req, res) => {
    const { status } = updateStatusSchema.parse(req.body);
    const seller = await Seller.findOneAndUpdate({ id: req.params.id }, { status }, { new: true, runValidators: true });
    if (!seller) {
        throw new ApiError(404, 'Seller not found');
    }
    res.status(200).json(ApiResponse.success('Seller status updated successfully', seller));
});
export const deleteSeller = asyncHandler(async (req, res) => {
    const seller = await Seller.findOneAndDelete({ id: req.params.id });
    if (!seller) {
        throw new ApiError(404, 'Seller not found');
    }
    res.status(200).json(ApiResponse.success('Seller deleted successfully', seller));
});
