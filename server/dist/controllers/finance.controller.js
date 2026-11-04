import Transaction from '../models/Transaction.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, calculateTotalPages } from '../utils/pagination.js';
export const getFinanceSummary = asyncHandler(async (req, res) => {
    const [totalRevenue, platformEarnings, sellerEarnings, settledCount, pendingCount] = await Promise.all([
        Transaction.aggregate([
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        Transaction.aggregate([
            { $group: { _id: null, total: { $sum: '$commission' } } },
        ]),
        Transaction.aggregate([
            { $group: { _id: null, total: { $sum: '$net' } } },
        ]),
        Transaction.countDocuments({ status: 'Settled' }),
        Transaction.countDocuments({ status: 'Pending' }),
    ]);
    const revenue = totalRevenue[0]?.total || 0;
    const commission = platformEarnings[0]?.total || 0;
    const net = sellerEarnings[0]?.total || 0;
    res.status(200).json(ApiResponse.success('Finance summary retrieved successfully', {
        totalRevenue: revenue,
        platformEarnings: commission,
        sellerEarnings: net,
        settledTransactions: settledCount,
        pendingTransactions: pendingCount,
    }));
});
export const getTransactions = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, search = '', status = '', seller = '', sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
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
            { order: { $regex: search, $options: 'i' } },
            { seller: { $regex: search, $options: 'i' } },
        ];
    }
    if (status) {
        query.status = status;
    }
    if (seller) {
        query.seller = seller;
    }
    const sortOptions = {};
    if (pagination.sortBy) {
        sortOptions[pagination.sortBy] = pagination.sortOrder === 'asc' ? 1 : -1;
    }
    const [transactions, total] = await Promise.all([
        Transaction.find(query)
            .sort(sortOptions)
            .skip(pagination.skip)
            .limit(pagination.limit),
        Transaction.countDocuments(query),
    ]);
    pagination.total = total;
    pagination.totalPages = calculateTotalPages(total, pagination.limit);
    res.status(200).json(ApiResponse.success('Transactions retrieved successfully', transactions, pagination));
});
export const getTransactionById = asyncHandler(async (req, res) => {
    const transaction = await Transaction.findOne({ id: req.params.id });
    if (!transaction) {
        throw new ApiError(404, 'Transaction not found');
    }
    res.status(200).json(ApiResponse.success('Transaction retrieved successfully', transaction));
});
export const settleTransaction = asyncHandler(async (req, res) => {
    const transaction = await Transaction.findOneAndUpdate({ id: req.params.id }, { status: 'Settled', settlementDate: new Date() }, { new: true, runValidators: true });
    if (!transaction) {
        throw new ApiError(404, 'Transaction not found');
    }
    res.status(200).json(ApiResponse.success('Transaction settled successfully', transaction));
});
