import { Request, Response } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import Admin from '../models/Admin.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, calculateTotalPages } from '../utils/pagination.js';
import { createAuditLog } from '../services/audit.service.js';
import { sendNotification } from '../services/notification.service.js';
import { ALL_PERMISSIONS, DEFAULT_EMPLOYEE_PERMISSIONS } from '../config/permissions.js';
import Role from '../models/Role.js';
import { getEffectivePermissions } from '../middleware/permission.middleware.js';
import { validatePasswordStrength } from '../utils/password.js';
import { normalizeUsername, validateUsername } from '../utils/username.js';

const usernameField = z
  .string()
  .min(1, 'Username is required')
  .transform((v) => normalizeUsername(v))
  .superRefine((val, ctx) => {
    const result = validateUsername(val);
    if (!result.ok) {
      ctx.addIssue({ code: 'custom', message: result.message });
    }
  });

const createUserSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').transform((v) => v.trim()),
  username: usernameField.optional(),
  email: z
    .string()
    .email('Invalid email address')
    .transform((v) => v.trim().toLowerCase()),
  mobileNumber: z.string().optional().transform((v) => v?.trim() || undefined),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(1, 'Please confirm the password'),
  department: z.string().default('Engineering').transform((v) => v.trim()),
  jobTitle: z.string().default('Specialist').transform((v) => v.trim()),
  designation: z.string().optional().transform((v) => v?.trim() || undefined),
  reportingManager: z.string().optional().transform((v) => v?.trim() || undefined),
  location: z.string().optional(),
  bio: z.string().optional(),
  employeeId: z.string().optional(),
  employeeSerial: z.string().optional().transform((v) => v?.trim() || undefined),
  role: z.string().default('Employee').transform((v) => v.trim()),
  roleId: z.string().optional(),
  adminMessage: z.string().optional(),
  status: z.enum(['Active', 'Inactive', 'Suspended']).default('Active'),
  permissionGrants: z.array(z.string()).default([]),
  permissionDenials: z.array(z.string()).default([]),
}).superRefine((data, ctx) => {
  if (data.password !== data.confirmPassword) {
    ctx.addIssue({ code: 'custom', message: 'Passwords do not match', path: ['confirmPassword'] });
  }
});

const updateUserSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').optional(),
  username: z.string().optional(),
  email: z.string().email().optional(),
  mobileNumber: z.string().optional(),
  department: z.string().optional(),
  jobTitle: z.string().optional(),
  designation: z.string().optional(),
  reportingManager: z.string().optional(),
  location: z.string().optional(),
  bio: z.string().optional(),
  employeeId: z.string().optional(),
  employeeSerial: z.string().optional(),
  role: z.string().optional(),
  roleId: z.string().optional(),
  adminMessage: z.string().optional(),
  status: z.enum(['Active', 'Inactive', 'Suspended']).optional(),
  permissionGrants: z.array(z.string()).optional(),
  permissionDenials: z.array(z.string()).optional(),
});

function assertValidPermissions(list: string[], label: string) {
  const registered = new Set<string>(ALL_PERMISSIONS as string[]);
  const invalid = list.filter((p) => !registered.has(p));
  if (invalid.length > 0) {
    throw new ApiError(400, `Invalid ${label}: ${invalid.join(', ')}`);
  }
}

function sanitizePermissionOverrides(grants: string[], denials: string[]) {
  assertValidPermissions(grants, 'permission grants');
  assertValidPermissions(denials, 'permission denials');
  const denialSet = new Set(denials);
  const cleanGrants = grants.filter((p) => !denialSet.has(p));
  return { permissionGrants: [...new Set(cleanGrants)], permissionDenials: [...new Set(denials)] };
}

function isValidId(id: unknown): id is string {
  return typeof id === 'string' && mongoose.Types.ObjectId.isValid(id);
}

async function assertNotLastActiveSuperAdmin(targetUser: any) {
  if (targetUser.role === 'Super Admin' && targetUser.status === 'Active' && targetUser.isActive) {
    const superAdminCount = await Admin.countDocuments({
      role: 'Super Admin',
      status: 'Active',
      isActive: true,
    });
    if (superAdminCount <= 1) {
      throw new ApiError(400, 'Cannot deactivate, suspend, or remove the last active Super Admin');
    }
  }
}

export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 10, search = '', department = '', role = '', status = '' } = req.query;

  const pagination = getPagination({
    page: Number(page),
    limit: Number(limit),
  });

  const query: any = { deletedAt: null, deletionState: { $ne: 'permanent' } };

  if (search) {
    const term = String(search);
    query.$or = [
      { fullName: { $regex: term, $options: 'i' } },
      { username: { $regex: term, $options: 'i' } },
      { email: { $regex: term, $options: 'i' } },
      { department: { $regex: term, $options: 'i' } },
      { jobTitle: { $regex: term, $options: 'i' } },
    ];
  }

  if (department) {
    query.department = department;
  }

  if (role) {
    query.role = role;
  }

  if (status) {
    query.status = status;
  }

  const [users, total] = await Promise.all([
    Admin.find(query)
      .select('-password')
      .populate('roleId', 'name permissions status isSystem')
      .sort({ createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit),
    Admin.countDocuments(query),
  ]);

  pagination.total = total;
  pagination.totalPages = calculateTotalPages(total, pagination.limit);

  res.status(200).json(ApiResponse.success('Users retrieved successfully', users, pagination));
});

export const getUserById = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidId(req.params.id)) {
    throw new ApiError(400, 'Invalid user ID format');
  }

  const user = await Admin.findById(req.params.id)
    .select('-password')
    .populate('roleId', 'name permissions isSystem status');

  if (!user || user.deletedAt || user.deletionState === 'permanent') {
    throw new ApiError(404, 'User not found');
  }

  res.status(200).json(ApiResponse.success('User retrieved successfully', user));
});

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const data = createUserSchema.parse(req.body);

  // 1. Resolve username: generate from email or full name if not provided
  let rawUsername = data.username;
  if (!rawUsername) {
    const emailPrefix = data.email.split('@')[0];
    rawUsername = normalizeUsername(emailPrefix);
  }
  const usernameCheck = validateUsername(rawUsername);
  if (!usernameCheck.ok) {
    throw new ApiError(400, usernameCheck.message);
  }
  let username = usernameCheck.username;

  // If auto-generated username has collision, add random digits
  let existingUsername = await Admin.findOne({ username });
  if (existingUsername) {
    if (data.username) {
      throw new ApiError(409, 'Username is already taken');
    } else {
      username = `${username}${Math.floor(100 + Math.random() * 900)}`;
    }
  }

  // 2. Validate email uniqueness
  const existingEmail = await Admin.findOne({ email: data.email });
  if (existingEmail) {
    throw new ApiError(409, 'User with this email already exists');
  }

  // 3. Resolve employeeSerial / employeeId
  let employeeSerial = data.employeeSerial;
  if (employeeSerial) {
    const existingSerial = await Admin.findOne({ employeeSerial });
    if (existingSerial) throw new ApiError(409, 'Employee serial number is already in use');
  } else {
    // Generate unique serial if omitted
    const count = await Admin.countDocuments();
    employeeSerial = `EMP-${String(count + 1).padStart(4, '0')}`;
  }

  // 4. Validate password strength
  const strengthError = validatePasswordStrength(data.password);
  if (strengthError) {
    throw new ApiError(400, strengthError);
  }

  // 5. Hash password with bcrypt
  const salt = await bcrypt.genSalt(12);
  const hashedPassword = await bcrypt.hash(data.password, salt);

  // 6. Privilege escalation check:
  // Ensure the creator does not grant permissions they do not possess, unless they are Super Admin
  const isCreatorSuperAdmin = req.admin?.role === 'Super Admin';
  let creatorPermissions = new Set<string>();
  if (!isCreatorSuperAdmin && req.admin?._id) {
    const creatorEffective = await getEffectivePermissions(req.admin._id);
    creatorPermissions = creatorEffective.permissions;
  }

  // 7. Resolve Role & Baseline permissions
  let assignedRole = data.role || 'Employee';
  let roleId: any = undefined;
  let rolePermissions: string[] = [];

  if (data.roleId && isValidId(data.roleId)) {
    const foundRole = await Role.findById(data.roleId);
    if (foundRole) {
      assignedRole = foundRole.name;
      roleId = foundRole._id;
      rolePermissions = foundRole.permissions || [];
    }
  } else if (assignedRole && assignedRole !== 'Employee') {
    const foundRole = await Role.findOne({ name: assignedRole, status: 'Active' });
    if (foundRole) {
      roleId = foundRole._id;
      rolePermissions = foundRole.permissions || [];
    }
  }

  // Privilege escalation check on role: Non-Super Admin cannot assign Super Admin role
  if (assignedRole === 'Super Admin' && !isCreatorSuperAdmin) {
    throw new ApiError(403, 'Only Super Admin can assign the Super Admin role');
  }

  // Combine baseline employee permissions + role permissions + explicit grants
  const mergedGrants = new Set<string>([
    ...DEFAULT_EMPLOYEE_PERMISSIONS,
    ...rolePermissions,
    ...(data.permissionGrants || []),
  ]);

  // Check if non-SuperAdmin creator is granting permissions they don't possess
  if (!isCreatorSuperAdmin) {
    const unauthorizedGrants = Array.from(mergedGrants).filter(
      (p) => !DEFAULT_EMPLOYEE_PERMISSIONS.includes(p) && !creatorPermissions.has(p)
    );
    if (unauthorizedGrants.length > 0) {
      throw new ApiError(
        403,
        `Privilege escalation prevented: You cannot grant permissions you do not possess: ${unauthorizedGrants.join(', ')}`
      );
    }
  }

  const overrides = sanitizePermissionOverrides(Array.from(mergedGrants), data.permissionDenials);
  const adminMessage = data.adminMessage?.trim() || '';

  const newUser = await Admin.create({
    fullName: data.fullName,
    username,
    email: data.email,
    mobileNumber: data.mobileNumber,
    password: hashedPassword,
    role: assignedRole,
    roleId,
    department: data.department,
    jobTitle: data.jobTitle,
    designation: data.designation || data.jobTitle,
    reportingManager: data.reportingManager,
    location: data.location,
    bio: data.bio,
    employeeId: data.employeeId?.trim() || employeeSerial,
    employeeSerial,
    adminMessage: adminMessage || undefined,
    permissionGrants: overrides.permissionGrants,
    permissionDenials: overrides.permissionDenials,
    isActive: data.status === 'Active',
    status: data.status,
    mustChangePassword: false,
    createdBy: req.admin?._id,
    deletionState: 'none',
    deletedAt: null,
  });

  await createAuditLog({
    action: 'USER_CREATED',
    entity: 'Admin',
    entityId: newUser._id.toString(),
    adminId: req.admin?._id,
    adminName: req.admin?.fullName,
    details: {
      email: newUser.email,
      username: newUser.username,
      employeeSerial: newUser.employeeSerial,
      department: newUser.department,
      role: newUser.role,
      status: newUser.status,
      permissionCount: overrides.permissionGrants.length,
    },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  const welcomeMessage = adminMessage
    ? `Your ARDUMUL account is ready. ${adminMessage}`
    : 'Your employee profile has been created. You can sign in immediately with the password provided by your administrator.';

  await sendNotification({
    adminId: newUser._id,
    title: 'Account created',
    message: welcomeMessage,
    type: 'success',
    link: '/admin/profile',
  });

  const responseUser = newUser.toObject();
  delete (responseUser as any).password;

  res.status(201).json(
    ApiResponse.success('User created successfully', {
      user: responseUser,
      assignedRole: newUser.role,
      adminMessage: adminMessage || undefined,
      permissions: overrides.permissionGrants,
    })
  );
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  // Never accept password / privilege fields from generic profile updates
  const {
    password: _pw,
    mustChangePassword: _mcp,
    tokenVersion: _tv,
    isActive: _ia,
    role: _role,
    ...safeBody
  } = req.body || {};

  const updates = updateUserSchema.parse(safeBody);
  if (!isValidId(req.params.id)) {
    throw new ApiError(400, 'Invalid user ID format');
  }
  const targetUser = await Admin.findById(req.params.id);

  if (!targetUser || targetUser.deletedAt || targetUser.deletionState === 'permanent') {
    throw new ApiError(404, 'User not found');
  }

  if (targetUser.role === 'Super Admin' && req.admin?.role !== 'Super Admin') {
    throw new ApiError(403, 'Cannot modify Super Admin accounts');
  }


  if (
    req.admin?._id === targetUser._id.toString() &&
    req.admin?.role !== 'Super Admin' &&
    (updates.permissionGrants || updates.permissionDenials)
  ) {
    throw new ApiError(403, 'You cannot change your own permissions');
  }

  const previousStatus = targetUser.status;
  let tokenVersionIncrement = 0;
  const auditDetails: Record<string, unknown> = {};

  if (updates.username !== undefined) {
    const usernameCheck = validateUsername(updates.username);
    if (!usernameCheck.ok) {
      throw new ApiError(400, usernameCheck.message);
    }
    const clash = await Admin.findOne({
      username: usernameCheck.username,
      _id: { $ne: targetUser._id },
    });
    if (clash) {
      throw new ApiError(409, 'Username is already taken');
    }
    updates.username = usernameCheck.username;
    auditDetails.username = { from: targetUser.username, to: usernameCheck.username };
  }

  if (updates.email !== undefined) {
    const email = updates.email.trim().toLowerCase();
    const clash = await Admin.findOne({ email, _id: { $ne: targetUser._id } });
    if (clash) {
      throw new ApiError(409, 'User with this email already exists');
    }
    updates.email = email;
    auditDetails.email = { from: targetUser.email, to: email };
  }

  if (updates.permissionGrants || updates.permissionDenials) {
    const overrides = sanitizePermissionOverrides(
      updates.permissionGrants || targetUser.permissionGrants || [],
      updates.permissionDenials || targetUser.permissionDenials || []
    );
    (updates as any).permissionGrants = overrides.permissionGrants;
    (updates as any).permissionDenials = overrides.permissionDenials;
    tokenVersionIncrement = 1;
    auditDetails.permissions = overrides;
  }

  if (updates.status && updates.status !== previousStatus) {
    if (updates.status !== 'Active') {
      await assertNotLastActiveSuperAdmin(targetUser);
      (updates as any).isActive = false;
      tokenVersionIncrement = 1;
    } else {
      (updates as any).isActive = true;
      // Do not restore previously revoked sessions
      tokenVersionIncrement = 1;
    }
    auditDetails.status = { from: previousStatus, to: updates.status };
  }

  if (updates.fullName) auditDetails.fullName = updates.fullName;
  if (updates.department) auditDetails.department = updates.department;
  if (updates.jobTitle) auditDetails.jobTitle = updates.jobTitle;

  const updatedUser = await Admin.findByIdAndUpdate(
    req.params.id,
    {
      $set: updates,
      ...(tokenVersionIncrement > 0 ? { $inc: { tokenVersion: 1 } } : {}),
    },
    { new: true, runValidators: true }
  ).select('-password');

  const auditAction = auditDetails.role
    ? 'USER_ROLE_CHANGED'
    : auditDetails.permissions
      ? 'USER_PERMISSIONS_OVERRIDDEN'
      : 'USER_UPDATED';

  await createAuditLog({
    action: auditAction,
    entity: 'Admin',
    entityId: targetUser._id.toString(),
    adminId: req.admin?._id,
    adminName: req.admin?.fullName,
    details: auditDetails,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  if (auditDetails.role) {
    await sendNotification({
      adminId: targetUser._id,
      title: 'Role changed',
      message: `Your role was updated to ${auditDetails.role && (auditDetails.role as any).to}.`,
      type: 'info',
      link: '/admin/profile',
    });
  }
  if (auditDetails.permissions) {
    await sendNotification({
      adminId: targetUser._id,
      title: 'Permissions changed',
      message: 'Your individual permissions were updated by an administrator.',
      type: 'warning',
      link: '/admin/profile',
    });
  }

  res.status(200).json(ApiResponse.success('User updated successfully', updatedUser));
});

export const setUserStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.body;
  if (!['Active', 'Inactive', 'Suspended'].includes(status)) {
    throw new ApiError(400, 'Invalid status. Must be Active, Inactive, or Suspended');
  }

  if (!isValidId(req.params.id)) {
    throw new ApiError(400, 'Invalid user ID format');
  }

  const targetUser = await Admin.findById(req.params.id);
  if (!targetUser) {
    throw new ApiError(404, 'User not found');
  }

  if (targetUser.role === 'Super Admin' && req.admin?.role !== 'Super Admin') {
    throw new ApiError(403, 'Cannot modify Super Admin accounts');
  }

  const previousStatus = targetUser.status;

  if (status !== 'Active') {
    await assertNotLastActiveSuperAdmin(targetUser);
  }

  targetUser.status = status;
  targetUser.isActive = status === 'Active';
  // Always revoke sessions on status change so reactivation does not restore old tokens
  targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
  await targetUser.save();

  await createAuditLog({
    action: `USER_STATUS_${status.toUpperCase()}`,
    entity: 'Admin',
    entityId: targetUser._id.toString(),
    adminId: req.admin?._id,
    adminName: req.admin?.fullName,
    details: { previousStatus, newStatus: status },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json(
    ApiResponse.success(`User status changed to ${status} and sessions revoked`, {
      id: targetUser._id,
      status: targetUser.status,
      isActive: targetUser.isActive,
    })
  );
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { newPassword, confirmPassword } = req.body;

  if (!isValidId(req.params.id)) {
    throw new ApiError(400, 'Invalid user ID format');
  }

  const targetUser = await Admin.findById(req.params.id);
  if (!targetUser || targetUser.deletedAt) {
    throw new ApiError(404, 'User not found');
  }

  if (targetUser.role === 'Super Admin' && req.admin?.role !== 'Super Admin') {
    throw new ApiError(403, 'Cannot reset Super Admin password');
  }

  if (!newPassword) {
    throw new ApiError(400, 'A new permanent password is required');
  }
  if (confirmPassword && confirmPassword !== newPassword) {
    throw new ApiError(400, 'Passwords do not match');
  }
  const strengthError = validatePasswordStrength(newPassword);
  if (strengthError) {
    throw new ApiError(400, strengthError);
  }

  const salt = await bcrypt.genSalt(12);
  targetUser.password = await bcrypt.hash(newPassword, salt);
  targetUser.mustChangePassword = false;
  targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
  await targetUser.save();

  await createAuditLog({
    action: 'USER_PASSWORD_RESET',
    entity: 'Admin',
    entityId: targetUser._id.toString(),
    adminId: req.admin?._id,
    adminName: req.admin?.fullName,
    details: { requirePasswordChange: false, sessionsRevoked: true, method: 'admin_set_permanent' },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  await sendNotification({
    adminId: targetUser._id,
    title: 'Password updated',
    message: 'An administrator set a new password for your account. Sign in with the password they shared with you separately.',
    type: 'warning',
  });

  res.status(200).json(
    ApiResponse.success('User password updated and sessions revoked', {
      passwordSet: true,
    })
  );
});

export const revokeSessions = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidId(req.params.id)) {
    throw new ApiError(400, 'Invalid user ID format');
  }

  const targetUser = await Admin.findById(req.params.id);
  if (!targetUser) {
    throw new ApiError(404, 'User not found');
  }

  targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
  await targetUser.save();

  await createAuditLog({
    action: 'USER_SESSIONS_REVOKED',
    entity: 'Admin',
    entityId: targetUser._id.toString(),
    adminId: req.admin?._id,
    adminName: req.admin?.fullName,
    details: { tokenVersion: targetUser.tokenVersion },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json(ApiResponse.success('All active sessions revoked for user', null));
});

export const updatePermissions = asyncHandler(async (req: Request, res: Response) => {
  const { permissionGrants = [], permissionDenials = [] } = req.body;

  if (!Array.isArray(permissionGrants) || !Array.isArray(permissionDenials)) {
    throw new ApiError(400, 'permissionGrants and permissionDenials must be arrays');
  }

  if (!isValidId(req.params.id)) {
    throw new ApiError(400, 'Invalid user ID format');
  }

  const targetUser = await Admin.findById(req.params.id);
  if (!targetUser) {
    throw new ApiError(404, 'User not found');
  }

  if (targetUser.role === 'Super Admin' && req.admin?.role !== 'Super Admin') {
    throw new ApiError(403, 'Cannot modify Super Admin permissions');
  }

  if (req.admin?._id === targetUser._id.toString() && req.admin?.role !== 'Super Admin') {
    throw new ApiError(403, 'You cannot change your own permissions');
  }

  const overrides = sanitizePermissionOverrides(permissionGrants, permissionDenials);

  targetUser.permissionGrants = overrides.permissionGrants;
  targetUser.permissionDenials = overrides.permissionDenials;
  targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
  await targetUser.save();

  await createAuditLog({
    action: 'USER_PERMISSIONS_OVERRIDDEN',
    entity: 'Admin',
    entityId: targetUser._id.toString(),
    adminId: req.admin?._id,
    adminName: req.admin?.fullName,
    details: {
      permissionGrants: overrides.permissionGrants,
      permissionDenials: overrides.permissionDenials,
    },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  await sendNotification({
    adminId: targetUser._id,
    title: 'Permissions changed',
    message: 'Your individual permissions were updated by an administrator.',
    type: 'warning',
    link: '/admin/profile',
  });

  res.status(200).json(
    ApiResponse.success('User permissions updated successfully', {
      id: targetUser._id,
      permissionGrants: targetUser.permissionGrants,
      permissionDenials: targetUser.permissionDenials,
    })
  );
});

export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  if (req.admin?.role !== 'Super Admin') {
    throw new ApiError(403, 'Only Super Admin can permanently delete user accounts');
  }

  if (!isValidId(req.params.id)) {
    throw new ApiError(400, 'Invalid user ID format');
  }

  const { confirmation, username } = req.body || {};
  const targetUser = await Admin.findById(req.params.id).select('+password');
  if (!targetUser || targetUser.deletedAt || targetUser.deletionState === 'permanent') {
    throw new ApiError(404, 'User not found');
  }

  const typed = String(confirmation || username || '').trim();
  const expectedUsername = (targetUser.username || '').toLowerCase();
  if (typed !== 'DELETE' && typed.toLowerCase() !== expectedUsername) {
    throw new ApiError(400, 'Type DELETE or the employee username to confirm permanent deletion');
  }

  if (targetUser.role === 'Super Admin') {
    await assertNotLastActiveSuperAdmin(targetUser);
  }

  const originalId = targetUser._id.toString();
  const originalEmail = targetUser.email;
  const originalUsername = targetUser.username;
  const originalName = targetUser.fullName;
  const originalRole = targetUser.role;

  targetUser.isActive = false;
  targetUser.status = 'Inactive';
  targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
  targetUser.deletedAt = new Date();
  targetUser.deletedBy = req.admin?._id;
  targetUser.deletionState = 'permanent';
  targetUser.permissionGrants = [];
  targetUser.permissionDenials = [];
  targetUser.username = `deleted.${originalId.slice(-8)}.${originalUsername || 'user'}`.toLowerCase();
  targetUser.email = `deleted.${originalId}@deleted.ardumul.local`;
  targetUser.fullName = originalName;
  await targetUser.save();


  await createAuditLog({
    action: 'USER_PERMANENTLY_DELETED',
    entity: 'Admin',
    entityId: originalId,
    adminId: req.admin?._id,
    adminName: req.admin?.fullName,
    details: {
      originalEmail,
      originalUsername,
      originalName,
      originalRole,
      method: 'permanent_access_removal',
      note: 'Account excluded from active listings; historical records retained',
    },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json(
    ApiResponse.success('User permanently removed from active records. Historical references were preserved.', {
      id: originalId,
      deletionState: 'permanent',
    })
  );
});
