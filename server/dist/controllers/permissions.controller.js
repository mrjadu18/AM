import { z } from 'zod';
import Role from '../models/Role.js';
import Admin from '../models/Admin.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, calculateTotalPages } from '../utils/pagination.js';
import { ALL_PERMISSIONS, PERMISSION_CATEGORIES, DEFAULT_EMPLOYEE_PERMISSIONS } from '../config/permissions.js';
import { createAuditLog } from '../services/audit.service.js';
const createRoleSchema = z.object({
    name: z.string().min(1, 'Role name is required'),
    description: z.string().optional(),
    access: z.string().default('Custom Access'),
    permissions: z.array(z.string()).default([]),
    status: z.enum(['Active', 'Inactive']).default('Active'),
});
const updateRoleSchema = z.object({
    name: z.string().min(1, 'Role name is required').optional(),
    description: z.string().optional(),
    access: z.string().optional(),
    permissions: z.array(z.string()).optional(),
    status: z.enum(['Active', 'Inactive']).optional(),
});
export const getAvailablePermissions = asyncHandler(async (req, res) => {
    res.status(200).json(ApiResponse.success('Available permissions retrieved', {
        permissions: ALL_PERMISSIONS,
        categories: PERMISSION_CATEGORIES,
        defaultEmployeePermissions: DEFAULT_EMPLOYEE_PERMISSIONS,
    }));
});
export const getRoles = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, search = '', status = '' } = req.query;
    const pagination = getPagination({
        page: Number(page),
        limit: Number(limit),
    });
    const query = {};
    if (search) {
        query.$or = [
            { id: { $regex: search, $options: 'i' } },
            { name: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
        ];
    }
    if (status) {
        query.status = status;
    }
    const [roles, total] = await Promise.all([
        Role.find(query)
            .sort({ isSystem: -1, createdAt: -1 })
            .skip(pagination.skip)
            .limit(pagination.limit),
        Role.countDocuments(query),
    ]);
    // Recalculate assigned active users accurately
    const enrichedRoles = await Promise.all(roles.map(async (r) => {
        const activeUserCount = await Admin.countDocuments({
            $or: [{ roleId: r._id }, { role: r.name }],
        });
        return {
            ...r.toObject(),
            users: activeUserCount,
        };
    }));
    pagination.total = total;
    pagination.totalPages = calculateTotalPages(total, pagination.limit);
    res.status(200).json(ApiResponse.success('Roles retrieved successfully', enrichedRoles, pagination));
});
export const getRoleById = asyncHandler(async (req, res) => {
    const idParam = String(req.params.id);
    const isMongoId = /^[0-9a-fA-F]{24}$/.test(idParam);
    const role = await Role.findOne({
        $or: [{ id: idParam }, ...(isMongoId ? [{ _id: idParam }] : [])],
    });
    if (!role) {
        throw new ApiError(404, 'Role not found');
    }
    const assignedEmployees = await Admin.find({
        $or: [{ roleId: role._id }, { role: role.name }],
    }).select('fullName email department jobTitle status');
    res.status(200).json(ApiResponse.success('Role retrieved successfully', {
        ...role.toObject(),
        assignedEmployees,
    }));
});
function assertRegisteredPermissions(permissions) {
    const registered = new Set(ALL_PERMISSIONS);
    const invalid = permissions.filter((p) => !registered.has(p));
    if (invalid.length > 0) {
        throw new ApiError(400, `Invalid permissions: ${invalid.join(', ')}`);
    }
}
export const createRole = asyncHandler(async (req, res) => {
    const data = createRoleSchema.parse(req.body);
    assertRegisteredPermissions(data.permissions);
    if (data.name === 'Super Admin' && req.admin?.role !== 'Super Admin') {
        throw new ApiError(403, 'Only Super Admin can create a Super Admin role');
    }
    const existing = await Role.findOne({ name: data.name });
    if (existing) {
        throw new ApiError(409, `A role with name "${data.name}" already exists`);
    }
    const count = await Role.countDocuments();
    const id = `ROL-${String(count + 1).padStart(3, '0')}`;
    const role = await Role.create({
        id,
        name: data.name,
        description: data.description,
        access: data.access || 'Custom Access',
        permissions: data.permissions,
        status: data.status,
        isSystem: false,
        createdBy: req.admin?._id,
    });
    await createAuditLog({
        action: 'ROLE_CREATED',
        entity: 'Role',
        entityId: role.id,
        adminId: req.admin?._id,
        adminName: req.admin?.fullName,
        details: { name: role.name, permissionsCount: role.permissions.length },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
    });
    res.status(201).json(ApiResponse.success('Role created successfully', role));
});
export const updateRole = asyncHandler(async (req, res) => {
    const updates = updateRoleSchema.parse(req.body);
    const idParam = String(req.params.id);
    const isMongoId = /^[0-9a-fA-F]{24}$/.test(idParam);
    const role = await Role.findOne({
        $or: [{ id: idParam }, ...(isMongoId ? [{ _id: idParam }] : [])],
    });
    if (!role) {
        throw new ApiError(404, 'Role not found');
    }
    if (role.isSystem && updates.name && updates.name !== role.name) {
        throw new ApiError(400, 'Cannot rename system-protected roles');
    }
    if (updates.permissions) {
        assertRegisteredPermissions(updates.permissions);
    }
    Object.assign(role, updates, { updatedBy: req.admin?._id });
    await role.save();
    await createAuditLog({
        action: 'ROLE_UPDATED',
        entity: 'Role',
        entityId: role.id,
        adminId: req.admin?._id,
        adminName: req.admin?.fullName,
        details: updates,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
    });
    res.status(200).json(ApiResponse.success('Role updated successfully', role));
});
export const duplicateRole = asyncHandler(async (req, res) => {
    const idParam = String(req.params.id);
    const isMongoId = /^[0-9a-fA-F]{24}$/.test(idParam);
    const sourceRole = await Role.findOne({
        $or: [{ id: idParam }, ...(isMongoId ? [{ _id: idParam }] : [])],
    });
    if (!sourceRole) {
        throw new ApiError(404, 'Source role not found');
    }
    const { newName } = req.body;
    const duplicateName = newName || `${sourceRole.name} (Copy)`;
    const existing = await Role.findOne({ name: duplicateName });
    if (existing) {
        throw new ApiError(409, `A role with name "${duplicateName}" already exists`);
    }
    const count = await Role.countDocuments();
    const id = `ROL-${String(count + 1).padStart(3, '0')}`;
    const cloned = await Role.create({
        id,
        name: duplicateName,
        description: `Duplicated from ${sourceRole.name}. ${sourceRole.description || ''}`,
        access: sourceRole.access,
        permissions: sourceRole.permissions,
        status: 'Active',
        isSystem: false,
        createdBy: req.admin?._id,
    });
    await createAuditLog({
        action: 'ROLE_DUPLICATED',
        entity: 'Role',
        entityId: cloned.id,
        adminId: req.admin?._id,
        adminName: req.admin?.fullName,
        details: { sourceRole: sourceRole.name, duplicatedRole: cloned.name },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
    });
    res.status(201).json(ApiResponse.success('Role duplicated successfully', cloned));
});
export const deleteRole = asyncHandler(async (req, res) => {
    const idParam = String(req.params.id);
    const isMongoId = /^[0-9a-fA-F]{24}$/.test(idParam);
    const role = await Role.findOne({
        $or: [{ id: idParam }, ...(isMongoId ? [{ _id: idParam }] : [])],
    });
    if (!role) {
        throw new ApiError(404, 'Role not found');
    }
    if (role.isSystem) {
        throw new ApiError(400, 'System-protected roles cannot be deleted');
    }
    // Check if role is currently assigned to any employees
    const assignedCount = await Admin.countDocuments({
        $or: [{ roleId: role._id }, { role: role.name }],
    });
    if (assignedCount > 0) {
        const { reassignToRoleId } = req.body;
        if (!reassignToRoleId) {
            throw new ApiError(400, `Cannot delete role "${role.name}" because ${assignedCount} user(s) are assigned to it. Please reassign them first or provide reassignToRoleId.`);
        }
        const replacementRole = await Role.findById(reassignToRoleId);
        if (!replacementRole) {
            throw new ApiError(404, 'Replacement role not found');
        }
        await Admin.updateMany({ $or: [{ roleId: role._id }, { role: role.name }] }, { $set: { roleId: replacementRole._id, role: replacementRole.name } });
    }
    await Role.deleteOne({ _id: role._id });
    await createAuditLog({
        action: 'ROLE_DELETED',
        entity: 'Role',
        entityId: role.id,
        adminId: req.admin?._id,
        adminName: req.admin?.fullName,
        details: { name: role.name },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
    });
    res.status(200).json(ApiResponse.success('Role deleted safely', null));
});
