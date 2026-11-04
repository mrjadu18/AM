import bcrypt from 'bcryptjs';
import { z } from 'zod';
import Admin from '../models/Admin.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/generateToken.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getEffectivePermissions } from '../middleware/permission.middleware.js';
import { createAuditLog } from '../services/audit.service.js';
import { validatePasswordStrength } from '../utils/password.js';
import crypto from 'crypto';
import PasswordResetRequest from '../models/PasswordResetRequest.js';
import { sendEmail, isEmailConfigured, emailConfigError } from '../services/email.service.js';
import { env } from '../config/env.js';
// Accept either an email address or a username as the identifier.
// Also accept legacy `email` field from older clients.
const loginSchema = z
    .object({
    identifier: z.string().min(1).optional(),
    email: z.string().min(1).optional(),
    password: z.string().min(1, 'Password is required'),
})
    .superRefine((data, ctx) => {
    if (!data.identifier && !data.email) {
        ctx.addIssue({
            code: 'custom',
            message: 'Email or username is required',
            path: ['identifier'],
        });
    }
});
const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});
const updateProfileSchema = z.object({
    fullName: z.string().min(1, 'Full name is required').optional(),
    department: z.string().optional(),
    jobTitle: z.string().optional(),
    location: z.string().optional(),
    bio: z.string().optional(),
});
export const login = asyncHandler(async (req, res) => {
    const parsed = loginSchema.parse(req.body);
    const { password } = parsed;
    const identifier = (parsed.identifier || parsed.email || '').toString();
    const normalizedIdentifier = identifier.toLowerCase().trim();
    // Look up by email OR username (both normalized to lowercase)
    const admin = await Admin.findOne({
        $or: [
            { email: normalizedIdentifier },
            { username: normalizedIdentifier },
        ],
    }).select('+password');
    if (!admin || admin.deletedAt || admin.deletionState === 'permanent') {
        throw new ApiError(401, 'Invalid credentials');
    }
    if (!admin.isActive || admin.status === 'Inactive' || admin.status === 'Suspended') {
        throw new ApiError(403, 'Account is inactive or suspended. Please contact administrator.');
    }
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
        throw new ApiError(401, 'Invalid credentials');
    }
    admin.lastLogin = new Date();
    await admin.save();
    const tokenPayload = {
        id: admin._id.toString(),
        email: admin.email,
        role: admin.role,
        tokenVersion: admin.tokenVersion || 0,
    };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);
    const { permissions } = await getEffectivePermissions(admin._id.toString());
    await createAuditLog({
        action: 'USER_LOGIN',
        entity: 'Admin',
        entityId: admin._id.toString(),
        adminId: admin._id.toString(),
        adminName: admin.fullName,
        details: { identifier: normalizedIdentifier, role: admin.role },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
    });
    res.status(200).json(ApiResponse.success('Login successful', {
        admin: {
            id: admin._id,
            fullName: admin.fullName,
            username: admin.username,
            email: admin.email,
            role: admin.role,
            roleId: admin.roleId,
            department: admin.department,
            jobTitle: admin.jobTitle,
            location: admin.location,
            bio: admin.bio,
            status: admin.status,
            mustChangePassword: admin.mustChangePassword,
            permissions: Array.from(permissions),
        },
        accessToken,
        refreshToken,
    }));
});
export const logout = asyncHandler(async (req, res) => {
    if (req.admin?._id) {
        await createAuditLog({
            action: 'USER_LOGOUT',
            entity: 'Admin',
            entityId: req.admin._id,
            adminId: req.admin._id,
            adminName: req.admin.fullName,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
        });
    }
    res.status(200).json(ApiResponse.success('Logout successful', null));
});
export const getMe = asyncHandler(async (req, res) => {
    const admin = await Admin.findById(req.admin?._id).select('-password');
    if (!admin) {
        throw new ApiError(404, 'Admin not found');
    }
    const { permissions } = await getEffectivePermissions(admin._id.toString());
    res.status(200).json(ApiResponse.success('Profile retrieved successfully', {
        id: admin._id,
        fullName: admin.fullName,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        roleId: admin.roleId,
        department: admin.department,
        jobTitle: admin.jobTitle,
        location: admin.location,
        bio: admin.bio,
        isActive: admin.isActive,
        status: admin.status,
        mustChangePassword: admin.mustChangePassword,
        lastLogin: admin.lastLogin,
        createdAt: admin.createdAt,
        permissions: Array.from(permissions),
    }));
});
export const updateProfile = asyncHandler(async (req, res) => {
    // Strip protected fields — employees cannot escalate via profile update
    const { role: _r, roleId: _rid, permissionGrants: _pg, permissionDenials: _pd, status: _s, isActive: _ia, password: _pw, mustChangePassword: _mcp, tokenVersion: _tv, email: _e, username: _u, ...safeBody } = req.body || {};
    const updates = updateProfileSchema.parse(safeBody);
    const admin = await Admin.findByIdAndUpdate(req.admin?._id, { $set: updates }, { new: true, runValidators: true }).select('-password');
    if (!admin) {
        throw new ApiError(404, 'Admin not found');
    }
    await createAuditLog({
        action: 'PROFILE_UPDATED',
        entity: 'Admin',
        entityId: admin._id.toString(),
        adminId: admin._id.toString(),
        adminName: admin.fullName,
        details: updates,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
    });
    res.status(200).json(ApiResponse.success('Profile updated successfully', {
        id: admin._id,
        fullName: admin.fullName,
        email: admin.email,
        role: admin.role,
        department: admin.department,
        jobTitle: admin.jobTitle,
        location: admin.location,
        bio: admin.bio,
    }));
});
export const changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const strengthError = validatePasswordStrength(newPassword);
    if (strengthError) {
        throw new ApiError(400, strengthError);
    }
    const admin = await Admin.findById(req.admin?._id).select('+password');
    if (!admin) {
        throw new ApiError(404, 'Admin not found');
    }
    const isPasswordValid = await bcrypt.compare(currentPassword, admin.password);
    if (!isPasswordValid) {
        throw new ApiError(401, 'Current password is incorrect');
    }
    if (currentPassword === newPassword) {
        throw new ApiError(400, 'New password must be different from the current password');
    }
    const salt = await bcrypt.genSalt(12);
    admin.password = await bcrypt.hash(newPassword, salt);
    admin.mustChangePassword = false;
    // Increment tokenVersion to revoke all previous sessions — user must log in again with new password
    admin.tokenVersion = (admin.tokenVersion || 0) + 1;
    await admin.save();
    await createAuditLog({
        action: 'PASSWORD_CHANGED',
        entity: 'Admin',
        entityId: admin._id.toString(),
        adminId: admin._id.toString(),
        adminName: admin.fullName,
        details: { sessionRevoked: true },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
    });
    res.status(200).json(ApiResponse.success('Password changed successfully. Please log in again with your new password.', null));
});
export const refreshToken = asyncHandler(async (req, res) => {
    const { refreshToken: token } = req.body;
    if (!token) {
        throw new ApiError(401, 'Refresh token is required');
    }
    try {
        const decoded = verifyRefreshToken(token);
        const admin = await Admin.findById(decoded.id).select('-password');
        if (!admin || !admin.isActive || admin.status !== 'Active') {
            throw new ApiError(401, 'Invalid refresh token or inactive account');
        }
        if (decoded.tokenVersion !== undefined && admin.tokenVersion !== undefined) {
            if (decoded.tokenVersion < admin.tokenVersion) {
                throw new ApiError(401, 'Session has expired. Please log in again.');
            }
        }
        const tokenPayload = {
            id: admin._id.toString(),
            email: admin.email,
            role: admin.role,
            tokenVersion: admin.tokenVersion || 0,
        };
        const accessToken = generateAccessToken(tokenPayload);
        const newRefreshToken = generateRefreshToken(tokenPayload);
        res.status(200).json(ApiResponse.success('Token refreshed successfully', {
            accessToken,
            refreshToken: newRefreshToken,
        }));
    }
    catch (error) {
        throw new ApiError(401, 'Invalid refresh token');
    }
});
const recoveryRequestSchema = z.object({ identifier: z.string().min(1, 'Email or username is required') });
const recoveryReviewSchema = z.object({ notes: z.string().max(2000).optional() });
const recoveryResetSchema = z.object({ token: z.string().min(32), password: z.string().min(8), confirmPassword: z.string().min(1) })
    .superRefine((value, ctx) => { if (value.password !== value.confirmPassword)
    ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Passwords do not match' }); });
/** Deliberately returns the same message whether an account exists or not. */
export const requestPasswordRecovery = asyncHandler(async (req, res) => {
    const { identifier } = recoveryRequestSchema.parse(req.body);
    const normalized = identifier.trim().toLowerCase();
    const user = await Admin.findOne({ $or: [{ email: normalized }, { username: normalized }], deletedAt: null, deletionState: { $ne: 'permanent' } });
    if (user) {
        const sequence = await PasswordResetRequest.countDocuments();
        const record = await PasswordResetRequest.create({
            requestId: `PWR-${String(sequence + 1).padStart(5, '0')}`,
            identifier: normalized, userId: user._id, employeeName: user.fullName, username: user.username, email: user.email,
            status: 'Pending', requestType: 'employee_assistance',
        });
        const delivery = await sendEmail({
            to: env.ADMIN_NOTIFY_EMAIL,
            subject: `ARDUMUL password assistance request ${record.requestId}`,
            text: `Password assistance requested by ${user.fullName} (${user.username}, ${user.email}) at ${record.createdAt.toISOString()}. Review it in the Approval Center.`,
        });
        record.adminEmailAttempt = delivery;
        await record.save();
    }
    res.status(202).json(ApiResponse.success('If the account exists, a password assistance request has been submitted.', null));
});
export const listPasswordRecoveryRequests = asyncHandler(async (_req, res) => {
    const requests = await PasswordResetRequest.find().select('-tokenHash').sort({ createdAt: -1 }).limit(200);
    res.json(ApiResponse.success('Password recovery requests retrieved successfully', requests));
});
export const approvePasswordRecovery = asyncHandler(async (req, res) => {
    const { notes } = recoveryReviewSchema.parse(req.body || {});
    const record = await PasswordResetRequest.findOne({ requestId: req.params.requestId, status: 'Pending' });
    if (!record || !record.userId)
        throw new ApiError(404, 'Pending password recovery request not found');
    if (!isEmailConfigured())
        throw new ApiError(503, emailConfigError());
    const token = crypto.randomBytes(32).toString('hex');
    record.status = 'Approved';
    record.reviewedBy = req.admin?._id;
    record.reviewedByName = req.admin?.fullName;
    record.reviewedAt = new Date();
    record.reviewNotes = notes;
    record.tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    record.tokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const delivery = await sendEmail({ to: record.email, subject: 'Reset your ARDUMUL password', text: `Use this single-use link within one hour: ${env.FRONTEND_URL}/reset-password?token=${token}` });
    record.employeeEmailAttempt = delivery;
    await record.save();
    if (!delivery.delivered)
        throw new ApiError(503, delivery.error || 'Reset link could not be delivered');
    res.json(ApiResponse.success('Password recovery request approved and reset link delivered.', { requestId: record.requestId, expiresAt: record.tokenExpiresAt }));
});
export const rejectPasswordRecovery = asyncHandler(async (req, res) => {
    const { notes } = recoveryReviewSchema.parse(req.body || {});
    const record = await PasswordResetRequest.findOne({ requestId: req.params.requestId, status: 'Pending' });
    if (!record)
        throw new ApiError(404, 'Pending password recovery request not found');
    record.status = 'Rejected';
    record.reviewedBy = req.admin?._id;
    record.reviewedByName = req.admin?.fullName;
    record.reviewedAt = new Date();
    record.reviewNotes = notes;
    await record.save();
    res.json(ApiResponse.success('Password recovery request rejected.', { requestId: record.requestId }));
});
export const completePasswordRecovery = asyncHandler(async (req, res) => {
    const { token, password } = recoveryResetSchema.parse(req.body);
    const strengthError = validatePasswordStrength(password);
    if (strengthError)
        throw new ApiError(400, strengthError);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const record = await PasswordResetRequest.findOne({ tokenHash, status: 'Approved', tokenUsedAt: null }).select('+tokenHash');
    if (!record || !record.tokenExpiresAt || record.tokenExpiresAt <= new Date()) {
        if (record && record.tokenExpiresAt && record.tokenExpiresAt <= new Date()) {
            record.status = 'Expired';
            await record.save();
        }
        throw new ApiError(400, 'This reset link is invalid, expired, or has already been used');
    }
    const user = await Admin.findById(record.userId).select('+password');
    if (!user || user.deletedAt || user.deletionState === 'permanent')
        throw new ApiError(400, 'This reset link is no longer valid');
    user.password = await bcrypt.hash(password, await bcrypt.genSalt(12));
    user.mustChangePassword = false;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    record.status = 'Completed';
    record.tokenUsedAt = new Date();
    record.tokenHash = undefined;
    await record.save();
    res.json(ApiResponse.success('Password reset successfully. Please sign in with your new password.', null));
});
