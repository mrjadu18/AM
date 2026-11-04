import { Request, Response } from 'express';
import { z } from 'zod';
import PlatformSettings from '../models/PlatformSettings.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const updateSettingsSchema = z.object({
  storeName: z.string().optional(),
  supportEmail: z.string().email().optional(),
  commission: z.number().min(0).max(100).optional(),
  currency: z.enum(['INR', 'USD', 'EUR']).optional(),
  marketplace: z.boolean().optional(),
  sellerRegistration: z.boolean().optional(),
  productApproval: z.boolean().optional(),
  customerReviews: z.boolean().optional(),
  gst: z.boolean().optional(),
});

export const getSettings = asyncHandler(async (req: Request, res: Response) => {
  let settings = await PlatformSettings.findOne();

  if (!settings) {
    settings = await PlatformSettings.create({});
  }

  res.status(200).json(
    ApiResponse.success('Settings retrieved successfully', settings)
  );
});

export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const updates = updateSettingsSchema.parse(req.body);

  let settings = await PlatformSettings.findOne();

  if (!settings) {
    settings = await PlatformSettings.create(updates);
  } else {
    Object.assign(settings, updates);
    await settings.save();
  }

  res.status(200).json(
    ApiResponse.success('Settings updated successfully', settings)
  );
});

export const resetSettings = asyncHandler(async (req: Request, res: Response) => {
  await PlatformSettings.deleteMany({});
  const settings = await PlatformSettings.create({});

  res.status(200).json(
    ApiResponse.success('Settings reset to defaults', settings)
  );
});
