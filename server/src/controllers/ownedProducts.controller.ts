import { Request, Response } from 'express';
import { z } from 'zod';
import Product from '../models/Product.js';
import FileAsset from '../models/FileAsset.js';
import { persistUpload, resolveStoredFile, validateUpload, removeStoredFile } from '../services/storage.service.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, calculateTotalPages } from '../utils/pagination.js';

const createOwnedProductSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  category: z.string().min(1, 'Category is required'),
  price: z.number().min(0, 'Price must be positive'),
  stock: z.number().min(0, 'Stock cannot be negative').default(0),
  description: z.string().optional(),
  images: z.array(z.string()).optional(),
  serialNumber: z.string().optional(),
  sku: z.string().optional(),
  isOwned: z.boolean().optional(),
});

const updateOwnedProductSchema = z.object({
  name: z.string().min(1, 'Product name is required').optional(),
  category: z.string().min(1, 'Category is required').optional(),
  price: z.number().min(0, 'Price must be positive').optional(),
  stock: z.number().min(0, 'Stock cannot be negative').optional(),
  description: z.string().optional(),
  images: z.array(z.string()).optional(),
  status: z.enum(['Active', 'Inactive', 'Out of Stock']).optional(),
});

export const getOwnedProducts = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 10, search = '', status = '', category = '', sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

  const pagination = getPagination({
    page: Number(page),
    limit: Number(limit),
    sortBy: String(sortBy),
    sortOrder: sortOrder as 'asc' | 'desc',
  });

  const query: any = { isOwned: true };

  if (search) {
    query.$or = [
      { id: { $regex: search, $options: 'i' } },
      { name: { $regex: search, $options: 'i' } },
    ];
  }

  if (status) {
    query.status = status;
  }

  if (category) {
    query.category = category;
  }

  const sortOptions: any = {};
  if (pagination.sortBy) {
    sortOptions[pagination.sortBy] = pagination.sortOrder === 'asc' ? 1 : -1;
  }

  const [products, total] = await Promise.all([
    Product.find(query)
      .sort(sortOptions)
      .skip(pagination.skip)
      .limit(pagination.limit),
    Product.countDocuments(query),
  ]);

  pagination.total = total;
  pagination.totalPages = calculateTotalPages(total, pagination.limit);

  res.status(200).json(
    ApiResponse.success('Owned products retrieved successfully', products, pagination)
  );
});

export const getOwnedProductById = asyncHandler(async (req: Request, res: Response) => {
  const product = await Product.findOne({ id: req.params.id, isOwned: true });

  if (!product) {
    throw new ApiError(404, 'Owned product not found');
  }

  const attachments = await FileAsset.find({ ownerType: 'owned-product' as any, ownerId: product.id });
  (product as any).attachments = attachments;

  res.status(200).json(
    ApiResponse.success('Owned product retrieved successfully', product)
  );
});

export const createOwnedProduct = asyncHandler(async (req: Request, res: Response) => {
  const data = createOwnedProductSchema.parse(req.body);

  const count = await Product.countDocuments({ isOwned: true });
  const id = `ARD-${String(count + 1).padStart(3, '0')}`;

  const stamp = Date.now();
  const product = await Product.create({
    id,
    ...data,
    seller: 'Ardumul',
    serialNumber: data.serialNumber || `ARD-SN-${stamp}`,
    sku: (data.sku || `ARD-SKU-${stamp}`).toUpperCase(),
    isOwned: true,
  });

  res.status(201).json(
    ApiResponse.success('Owned product created successfully', product)
  );
});

export const updateOwnedProduct = asyncHandler(async (req: Request, res: Response) => {
  const updates = updateOwnedProductSchema.parse(req.body);

  const product = await Product.findOneAndUpdate(
    { id: req.params.id, isOwned: true },
    { $set: { ...updates, isOwned: true } },
    { new: true, runValidators: true }
  );

  if (!product) {
    throw new ApiError(404, 'Owned product not found');
  }

  res.status(200).json(
    ApiResponse.success('Owned product updated successfully', product)
  );
});

export const deleteOwnedProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await Product.findOneAndDelete({ id: req.params.id, isOwned: true });

  if (!product) {
    throw new ApiError(404, 'Owned product not found');
  }

  res.status(200).json(
    ApiResponse.success('Owned product deleted successfully', product)
  );
});

export const uploadOwnedProductAssets = asyncHandler(async (req: Request, res: Response) => {
  const product = await Product.findOne({ id: req.params.id, isOwned: true });
  if (!product) throw new ApiError(404, 'Owned product not found');
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const photos = files?.photos || []; const guides = files?.installationGuide || [];
  if (!photos.length && !guides.length) throw new ApiError(400, 'Select at least one image or installation guide');
  const created: any[] = [];
  try {
    for (const file of photos) {
      validateUpload(file, 'image'); const stored = persistUpload(file);
      const asset = await FileAsset.create({ fileId: `FIL-${new Date().getTime()}-${created.length}`, originalName: file.originalname, storedName: stored.storedName, mimeType: file.mimetype, size: file.size, ownerType: 'owned-product', ownerId: product.id, kind: 'photo', uploadedBy: req.admin?._id, uploadedByName: req.admin?.fullName });
      created.push(asset); product.imageAssetIds.push(asset.fileId);
    }
    for (const file of guides) {
      validateUpload(file, 'document'); const stored = persistUpload(file);
      const asset = await FileAsset.create({ fileId: `FIL-${new Date().getTime()}-${created.length}`, originalName: file.originalname, storedName: stored.storedName, mimeType: file.mimetype, size: file.size, ownerType: 'owned-product', ownerId: product.id, kind: 'guide', uploadedBy: req.admin?._id, uploadedByName: req.admin?.fullName });
      created.push(asset); product.installationGuideAssetId = asset.fileId;
    }
    await product.save();
  } catch (error) {
    for (const asset of created) { removeStoredFile(asset.storedName); await FileAsset.deleteOne({ _id: asset._id }); }
    throw error;
  }
  res.status(201).json(ApiResponse.success('Owned product attachments uploaded successfully', { product, assets: created.map((asset) => ({ fileId: asset.fileId, originalName: asset.originalName, kind: asset.kind, size: asset.size })) }));
});

export const downloadOwnedProductAsset = asyncHandler(async (req: Request, res: Response) => {
  const asset = await FileAsset.findOne({ fileId: req.params.fileId, ownerType: 'owned-product' as any });
  if (!asset) throw new ApiError(404, 'Owned product attachment not found');
  const path = resolveStoredFile((asset as any).storedName);
  res.setHeader('Content-Type', (asset as any).mimeType); res.setHeader('Content-Disposition', `attachment; filename="${(asset as any).originalName.replace(/[\r\n"]/g, '')}"`);
  res.sendFile(path);
});

export const removeOwnedProductAsset = asyncHandler(async (req: Request, res: Response) => {
  const product = await Product.findOne({ id: req.params.id, isOwned: true }); const asset = await FileAsset.findOne({ fileId: req.params.fileId, ownerType: 'owned-product' as any, ownerId: req.params.id });
  if (!product || !asset) throw new ApiError(404, 'Owned product attachment not found');
  product.imageAssetIds = product.imageAssetIds.filter((id) => id !== (asset as any).fileId); if (product.installationGuideAssetId === (asset as any).fileId) product.installationGuideAssetId = undefined;
  await product.save(); removeStoredFile((asset as any).storedName); await asset.deleteOne();
  res.json(ApiResponse.success('Owned product attachment removed', null));
});
