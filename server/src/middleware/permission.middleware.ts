import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError.js';
import Admin from '../models/Admin.js';
import Role from '../models/Role.js';
import { ALL_PERMISSIONS, PermissionKey } from '../config/permissions.js';

/**
 * Calculates effective permissions for an admin/user:
 * 1. Super Admin role gets all permissions unconditionally.
 * 2. Find Role permissions (if role is linked by ID or name).
 * 3. Add explicit permission grants.
 * 4. Remove explicit permission denials (denials take precedence over role grants).
 */
export async function getEffectivePermissions(adminId: string): Promise<{
  roleName: string;
  isSuperAdmin: boolean;
  permissions: Set<string>;
}> {
  const admin = await Admin.findById(adminId).lean();
  if (!admin || !admin.isActive || admin.deletedAt || admin.deletionState === 'permanent') {
    return { roleName: '', isSuperAdmin: false, permissions: new Set() };
  }

  if (admin.role === 'Super Admin') {
    return {
      roleName: 'Super Admin',
      isSuperAdmin: true,
      permissions: new Set(ALL_PERMISSIONS),
    };
  }

  const permissions = new Set<string>(Array.isArray(admin.permissionGrants) ? admin.permissionGrants : []);

  // One-time, repeat-safe migration for legacy role accounts. New accounts have
  // direct grants only; we retain historical role fields without using them again.
  if (permissions.size === 0 && (admin.roleId || admin.role)) {
    const roleDoc: any = admin.roleId ? await Role.findById(admin.roleId).lean() : await Role.findOne({ name: admin.role, status: 'Active' }).lean();
    if (roleDoc?.permissions?.length) {
      for (const permission of roleDoc.permissions) permissions.add(permission);
      await Admin.updateOne({ _id: admin._id, permissionGrants: { $size: 0 } }, { $set: { permissionGrants: Array.from(permissions) } });
    }
  }

  // Add explicit grants

  // Remove explicit denials
  if (Array.isArray(admin.permissionDenials)) {
    for (const p of admin.permissionDenials) {
      permissions.delete(p);
    }
  }

  return {
    roleName: admin.role,
    isSuperAdmin: false,
    permissions,
  };
}

/**
 * Express middleware to verify whether the authenticated user has ANY of the required permissions.
 * Checks dynamically against MongoDB to guarantee instant revocation and permission changes.
 */
export const requirePermission = (...requiredPermissions: (PermissionKey | string)[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.admin || !req.admin._id) {
        throw new ApiError(401, 'Authentication required');
      }

      const { isSuperAdmin, permissions } = await getEffectivePermissions(req.admin._id);

      if (isSuperAdmin) {
        return next();
      }

      const hasRequired = requiredPermissions.some((perm) => permissions.has(perm));
      if (!hasRequired) {
        throw new ApiError(
          403,
          `Forbidden: Missing required permission (${requiredPermissions.join(', ')})`
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
