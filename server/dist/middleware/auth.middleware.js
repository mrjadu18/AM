import { verifyAccessToken } from '../utils/generateToken.js';
import { ApiError } from '../utils/ApiError.js';
import Admin from '../models/Admin.js';
const PASSWORD_CHANGE_ALLOWED_PATHS = new Set([
    '/api/v1/auth/me',
    '/api/v1/auth/change-password',
    '/api/v1/auth/logout',
    '/api/v1/auth/refresh-token',
]);
function normalizeRequestPath(req) {
    const raw = (req.originalUrl || req.url || '').split('?')[0];
    return raw.replace(/\/+$/, '') || '/';
}
export const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new ApiError(401, 'Access denied. No token provided.');
        }
        const token = authHeader.substring(7);
        const decoded = verifyAccessToken(token);
        const admin = await Admin.findById(decoded.id).select('-password');
        if (!admin ||
            admin.deletedAt ||
            admin.deletionState === 'permanent' ||
            !admin.isActive ||
            admin.status === 'Inactive' ||
            admin.status === 'Suspended') {
            throw new ApiError(401, 'Invalid token, deactivated account, or session revoked.');
        }
        // Verify tokenVersion to support instant session revocation
        if (decoded.tokenVersion !== undefined && admin.tokenVersion !== undefined) {
            if (decoded.tokenVersion < admin.tokenVersion) {
                throw new ApiError(401, 'Session has been revoked. Please log in again.');
            }
        }
        req.admin = {
            ...decoded,
            _id: admin._id.toString(),
            fullName: admin.fullName,
            tokenVersion: admin.tokenVersion,
            role: admin.role,
            mustChangePassword: admin.mustChangePassword,
        };
        // Backend-enforced first-login password change gate
        if (admin.mustChangePassword) {
            const path = normalizeRequestPath(req);
            if (!PASSWORD_CHANGE_ALLOWED_PATHS.has(path)) {
                throw new ApiError(403, 'Password change required. Please update your temporary password before continuing.');
            }
        }
        next();
    }
    catch (error) {
        if (error instanceof ApiError) {
            next(error);
        }
        else {
            next(new ApiError(401, 'Invalid or expired token.'));
        }
    }
};
export const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const decoded = verifyAccessToken(token);
            const admin = await Admin.findById(decoded.id).select('-password');
            if (admin && admin.isActive && admin.status === 'Active') {
                req.admin = {
                    ...decoded,
                    _id: admin._id.toString(),
                    fullName: admin.fullName,
                    tokenVersion: admin.tokenVersion,
                    role: admin.role,
                    mustChangePassword: admin.mustChangePassword,
                };
            }
        }
        next();
    }
    catch (error) {
        next();
    }
};
