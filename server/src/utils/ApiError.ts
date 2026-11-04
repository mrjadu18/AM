export class ApiError extends Error {
  statusCode: number;
  isOperational: boolean;
  errors?: any[];

  constructor(statusCode: number, message: string, isOperational = true, errors?: any[]) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errors = errors;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (err: Error | ApiError, req: any, res: any, next: any) => {
  let error = err;

  if (!(error instanceof ApiError)) {
    const statusCode = 500;
    const message = error.message || 'Internal Server Error';
    error = new ApiError(statusCode, message, false);
  }

  const response = {
    success: false,
    message: error.message,
    ...(error instanceof ApiError && error.errors && { errors: error.errors }),
  };

  if (env.NODE_ENV === 'development') {
    console.error('Error:', error);
  }

  res.status(error instanceof ApiError ? error.statusCode : 500).json(response);
};

import { env } from '../config/env.js';
