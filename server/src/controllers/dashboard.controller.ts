import { Request, Response } from 'express';
import Order from '../models/Order.js';
import Seller from '../models/Seller.js';
import Product from '../models/Product.js';
import Customer from '../models/Customer.js';
import Transaction from '../models/Transaction.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getOverview = asyncHandler(async (req: Request, res: Response) => {
  const [
    totalOrders,
    totalRevenue,
    totalSellers,
    totalCustomers,
    totalProducts,
    pendingOrders,
    completedOrders,
    activeSellers,
  ] = await Promise.all([
    Order.countDocuments(),
    Transaction.aggregate([
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Seller.countDocuments(),
    Customer.countDocuments(),
    Product.countDocuments(),
    Order.countDocuments({ status: 'Pending' }),
    Order.countDocuments({ status: 'Completed' }),
    Seller.countDocuments({ status: 'Active' }),
  ]);

  const revenue = totalRevenue[0]?.total || 0;
  const commission = await Transaction.aggregate([
    { $group: { _id: null, total: { $sum: '$commission' } } },
  ]);

  const recentOrders = await Order.find()
    .sort({ createdAt: -1 })
    .limit(5)
    .select('id product customer seller amount status createdAt');

  const recentSellers = await Seller.find()
    .sort({ createdAt: -1 })
    .limit(5)
    .select('id name owner status createdAt');

  res.status(200).json(
    ApiResponse.success('Overview data retrieved successfully', {
      stats: {
        totalOrders,
        totalRevenue: revenue,
        totalSellers,
        totalCustomers,
        totalProducts,
        pendingOrders,
        completedOrders,
        activeSellers,
        commissionEarned: commission[0]?.total || 0,
      },
      recentOrders,
      recentSellers,
    })
  );
});
