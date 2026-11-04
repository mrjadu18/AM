import { Request, Response } from 'express';
import { z } from 'zod';
import Product from '../models/Product.js';
import FileAsset from '../models/FileAsset.js';
import { persistUpload, resolveStoredFile, validateUpload, removeStoredFile } from '../services/storage.service.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, calculateTotalPages } from '../utils/pagination.js';

const createProductSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  serialNumber: z.string().min(1, 'Serial number is required'),
  sku: z.string().min(1, 'SKU is required').transform((value) => value.trim().toUpperCase()),
  seller: z.string().min(1, 'Seller is required'),
  category: z.string().min(1, 'Category is required'),
  price: z.number().min(0, 'Price must be positive'),
  stock: z.number().min(0, 'Stock cannot be negative').default(0),
  description: z.string().optional(),
  images: z.array(z.string()).optional(),
  isOwned: z.boolean().default(false),
});

const updateProductSchema = z.object({
  name: z.string().min(1, 'Product name is required').optional(),
  serialNumber: z.string().min(1).optional(),
  sku: z.string().min(1).transform((value) => value.trim().toUpperCase()).optional(),
  seller: z.string().min(1, 'Seller is required').optional(),
  category: z.string().min(1, 'Category is required').optional(),
  price: z.number().min(0, 'Price must be positive').optional(),
  stock: z.number().min(0, 'Stock cannot be negative').optional(),
  description: z.string().optional(),
  images: z.array(z.string()).optional(),
  status: z.enum(['Draft', 'Pending', 'Published', 'Unpublished']).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['Draft', 'Pending', 'Published', 'Unpublished']),
});

export const getProducts = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 10, search = '', status = '', category = '', isOwned = '', sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

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
      { seller: { $regex: search, $options: 'i' } },
    ];
  }

  if (status) {
    query.status = status;
  }

  if (category) {
    query.category = category;
  }

  if (isOwned !== '') {
    query.isOwned = isOwned === 'true';
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
    ApiResponse.success('Products retrieved successfully', products, pagination)
  );
});

export const getProductById = asyncHandler(async (req: Request, res: Response) => {
  const product = await Product.findOne({ id: req.params.id });

  if (!product) {
    throw new ApiError(404, 'Product not found');
  }

  res.status(200).json(
    ApiResponse.success('Product retrieved successfully', product)
  );
});

export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  const data = createProductSchema.parse(req.body);

  const count = await Product.countDocuments();
  const id = data.isOwned
    ? `ARD-${String(count + 1).padStart(3, '0')}`
    : `PRD-${String(count + 1).padStart(3, '0')}`;

  const product = await Product.create({
    id,
    ...data,
  });

  res.status(201).json(
    ApiResponse.success('Product created successfully', product)
  );
});

export const uploadProductAssets = asyncHandler(async (req: Request, res: Response) => {
  const product = await Product.findOne({ id: req.params.id });
  if (!product) throw new ApiError(404, 'Product not found');
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const photos = files?.photos || []; const guides = files?.installationGuide || [];
  if (!photos.length && !guides.length) throw new ApiError(400, 'Select at least one image or installation guide');
  const created: any[] = [];
  try {
    for (const file of photos) {
      validateUpload(file, 'image'); const stored = persistUpload(file);
      const asset = await FileAsset.create({ fileId: `FIL-${new Date().getTime()}-${created.length}`, originalName: file.originalname, storedName: stored.storedName, mimeType: file.mimetype, size: file.size, ownerType: 'product', ownerId: product.id, kind: 'photo', uploadedBy: req.admin?._id, uploadedByName: req.admin?.fullName });
      created.push(asset); product.imageAssetIds.push(asset.fileId);
    }
    for (const file of guides) {
      validateUpload(file, 'document'); const stored = persistUpload(file);
      const asset = await FileAsset.create({ fileId: `FIL-${new Date().getTime()}-${created.length}`, originalName: file.originalname, storedName: stored.storedName, mimeType: file.mimetype, size: file.size, ownerType: 'product', ownerId: product.id, kind: 'guide', uploadedBy: req.admin?._id, uploadedByName: req.admin?.fullName });
      created.push(asset); product.installationGuideAssetId = asset.fileId;
    }
    await product.save();
  } catch (error) {
    for (const asset of created) { removeStoredFile(asset.storedName); await FileAsset.deleteOne({ _id: asset._id }); }
    throw error;
  }
  res.status(201).json(ApiResponse.success('Product attachments uploaded successfully', { product, assets: created.map((asset) => ({ fileId: asset.fileId, originalName: asset.originalName, kind: asset.kind, size: asset.size })) }));
});

export const downloadProductAsset = asyncHandler(async (req: Request, res: Response) => {
  const asset = await FileAsset.findOne({ fileId: req.params.fileId, ownerType: 'product' });
  if (!asset) throw new ApiError(404, 'Product attachment not found');
  const path = resolveStoredFile(asset.storedName);
  res.setHeader('Content-Type', asset.mimeType); res.setHeader('Content-Disposition', `attachment; filename="${asset.originalName.replace(/[\r\n"]/g, '')}"`);
  res.sendFile(path);
});

export const removeProductAsset = asyncHandler(async (req: Request, res: Response) => {
  const product = await Product.findOne({ id: req.params.id }); const asset = await FileAsset.findOne({ fileId: req.params.fileId, ownerType: 'product', ownerId: req.params.id });
  if (!product || !asset) throw new ApiError(404, 'Product attachment not found');
  product.imageAssetIds = product.imageAssetIds.filter((id) => id !== asset.fileId); if (product.installationGuideAssetId === asset.fileId) product.installationGuideAssetId = undefined;
  await product.save(); removeStoredFile(asset.storedName); await asset.deleteOne();
  res.json(ApiResponse.success('Product attachment removed', null));
});

export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const updates = updateProductSchema.parse(req.body);

  const product = await Product.findOneAndUpdate(
    { id: req.params.id },
    { $set: updates },
    { new: true, runValidators: true }
  );

  if (!product) {
    throw new ApiError(404, 'Product not found');
  }

  res.status(200).json(
    ApiResponse.success('Product updated successfully', product)
  );
});

export const updateProductStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = updateStatusSchema.parse(req.body);

  const product = await Product.findOneAndUpdate(
    { id: req.params.id },
    { status },
    { new: true, runValidators: true }
  );

  if (!product) {
    throw new ApiError(404, 'Product not found');
  }

  res.status(200).json(
    ApiResponse.success('Product status updated successfully', product)
  );
});

export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await Product.findOneAndDelete({ id: req.params.id });

  if (!product) {
    throw new ApiError(404, 'Product not found');
  }

  res.status(200).json(
    ApiResponse.success('Product deleted successfully', product)
  );
});
