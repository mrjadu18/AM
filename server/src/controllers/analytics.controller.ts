import { Request, Response } from 'express';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Transaction from '../models/Transaction.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getProductAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const [
    totalOrders,
    completedOrders,
    pendingOrders,
    totalRevenue,
    orderStatusBreakdown,
    topProducts,
    lowStockProducts,
  ] = await Promise.all([
    Order.countDocuments(),
    Order.countDocuments({ status: 'Completed' }),
    Order.countDocuments({ status: 'Pending' }),
    Transaction.aggregate([
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Order.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Product.find({ status: 'Published' })
      .sort({ totalSales: -1 })
      .limit(10)
      .select('id name category price totalSales totalRevenue'),
    Product.find({ stock: { $lt: 10 }, status: 'Published' })
      .sort({ stock: 1 })
      .limit(10)
      .select('id name category stock'),
  ]);

  const revenue = totalRevenue[0]?.total || 0;

  res.status(200).json(
    ApiResponse.success('Product analytics retrieved successfully', {
      overview: {
        totalOrders,
        completedOrders,
        pendingOrders,
        totalRevenue: revenue,
      },
      orderStatusBreakdown,
      topProducts,
      lowStockProducts,
    })
  );
});

export const getRevenueByProduct = asyncHandler(async (req: Request, res: Response) => {
  const revenueByProduct = await Product.aggregate([
    { $match: { status: 'Published' } },
    {
      $project: {
        id: 1,
        name: 1,
        category: 1,
        totalRevenue: 1,
        totalSales: 1,
      },
    },
    { $sort: { totalRevenue: -1 } },
  ]);

  res.status(200).json(
    ApiResponse.success('Revenue by product retrieved successfully', revenueByProduct)
  );
});

export const getCategoryPerformance = asyncHandler(async (req: Request, res: Response) => {
  const categoryPerformance = await Product.aggregate([
    { $match: { status: 'Published' } },
    {
      $group: {
        _id: '$category',
        totalRevenue: { $sum: '$totalRevenue' },
        totalSales: { $sum: '$totalSales' },
        productCount: { $sum: 1 },
      },
    },
    { $sort: { totalRevenue: -1 } },
  ]);

  res.status(200).json(
    ApiResponse.success('Category performance retrieved successfully', categoryPerformance)
  );
});
