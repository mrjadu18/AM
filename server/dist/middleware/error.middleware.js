import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';
export const errorHandler = (err, req, res, next) => {
    let error = err;
    if (error instanceof ZodError) {
        const issues = error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
        }));
        const firstMessage = issues[0]?.message || 'Validation failed';
        error = new ApiError(400, firstMessage, true, issues);
    }
    else if (!(error instanceof ApiError)) {
        const statusCode = 500;
        const message = error.message || 'Internal Server Error';
        error = new ApiError(statusCode, message, false);
    }
    const response = {
        success: false,
        message: error.message,
    };
    if (error instanceof ApiError && error.errors) {
        response.errors = error.errors;
    }
    if (env.NODE_ENV === 'development') {
        response.stack = error.stack;
    }
    res.status(error instanceof ApiError ? error.statusCode : 500).json(response);
};
export const notFound = (req, res, next) => {
    const error = new ApiError(404, `Route ${req.originalUrl} not found`);
    next(error);
};
