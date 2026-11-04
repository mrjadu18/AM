import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { PERMISSIONS } from '../config/permissions.js';
import * as ownedProductsController from '../controllers/ownedProducts.controller.js';
import { upload } from '../middleware/upload.middleware.js';

const router = Router();

router.get('/', authenticate, requirePermission(PERMISSIONS.PRODUCTS_VIEW), ownedProductsController.getOwnedProducts);
router.get('/:id', authenticate, requirePermission(PERMISSIONS.PRODUCTS_VIEW), ownedProductsController.getOwnedProductById);
router.post('/', authenticate, requirePermission(PERMISSIONS.PRODUCTS_CREATE, PERMISSIONS.PRODUCTS_MANAGE), ownedProductsController.createOwnedProduct);
router.post('/:id/attachments', authenticate, requirePermission(PERMISSIONS.PRODUCTS_UPDATE, PERMISSIONS.PRODUCTS_MANAGE), upload.fields([{ name: 'photos', maxCount: 10 }, { name: 'installationGuide', maxCount: 1 }]), ownedProductsController.uploadOwnedProductAssets);
router.get('/:id/attachments/:fileId', authenticate, requirePermission(PERMISSIONS.PRODUCTS_VIEW), ownedProductsController.downloadOwnedProductAsset);
router.delete('/:id/attachments/:fileId', authenticate, requirePermission(PERMISSIONS.PRODUCTS_UPDATE, PERMISSIONS.PRODUCTS_MANAGE), ownedProductsController.removeOwnedProductAsset);
router.patch('/:id', authenticate, requirePermission(PERMISSIONS.PRODUCTS_UPDATE, PERMISSIONS.PRODUCTS_MANAGE), ownedProductsController.updateOwnedProduct);
router.delete('/:id', authenticate, requirePermission(PERMISSIONS.PRODUCTS_DELETE, PERMISSIONS.PRODUCTS_MANAGE), ownedProductsController.deleteOwnedProduct);

export default router;
