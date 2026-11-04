import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError.js';

export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.admin) {
      throw new ApiError(401, 'Authentication required.');
    }

    if (!roles.includes(req.admin.role)) {
      throw new ApiError(403, 'Not authorized to access this resource.');
    }

    next();
  };
};

export const requireSuperAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.admin) {
    throw new ApiError(401, 'Authentication required.');
  }

  if (req.admin.role !== 'Super Admin') {
    throw new ApiError(403, 'Super Admin access required.');
  }

  next();
};
